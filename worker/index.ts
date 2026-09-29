/**
 * This Worker only ever handles POST /api/report — every other request is a
 * static asset served automatically by Cloudflare before it even reaches
 * this script (see the "assets" config in wrangler.jsonc).
 *
 * It deliberately does the least possible: it never talks to the GitHub
 * Issues API directly. It only commits a small file into reports/ using a
 * token scoped to Contents: read/write on this one repo — a separate GitHub
 * Action (using GitHub's own free per-run token) is what turns that file into
 * a real, labeled Issue. If this Worker's token ever leaked, the worst case
 * is "someone can commit junk files here," not "someone can touch the account."
 */

export interface Env {
  GITHUB_REPORTS_TOKEN: string;
  RATE_LIMIT_KV: KVNamespace;
}

interface ReportBody {
  type?: string;
  title?: string;
  description?: string;
  /** data: URL, already resized/compressed client-side */
  image?: string;
  /** hidden form field — real users never fill this in */
  honeypot?: string;
}

const OWNER = "eric-moorman";
const REPO = "mtg-player-local";
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 4000;
const MAX_IMAGE_BYTES = 750_000;
const RATE_LIMIT_PER_HOUR = 5;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/report" && request.method === "POST") {
      return handleReport(request, env);
    }
    return new Response("Not found", { status: 404 });
  },
};

async function handleReport(request: Request, env: Env): Promise<Response> {
  let body: ReportBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  if (body.honeypot) {
    // Pretend success so bots that filled every field don't learn anything.
    return json({ ok: true });
  }

  if (body.type !== "bug" && body.type !== "feature") {
    return json({ error: "Invalid report type." }, 400);
  }
  const title = (body.title ?? "").trim().slice(0, MAX_TITLE);
  const description = (body.description ?? "").trim().slice(0, MAX_DESCRIPTION);
  if (!title || !description) {
    return json({ error: "Please include a title and description." }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const rateKey = `rate:${ip}`;
  const countRaw = await env.RATE_LIMIT_KV.get(rateKey);
  const count = countRaw ? parseInt(countRaw, 10) : 0;
  if (count >= RATE_LIMIT_PER_HOUR) {
    return json({ error: "Too many reports from this network recently — please try again later." }, 429);
  }
  await env.RATE_LIMIT_KV.put(rateKey, String(count + 1), { expirationTtl: 3600 });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "report";
  const basePath = `reports/${timestamp}-${slug}`;

  let imageFilename: string | null = null;
  if (typeof body.image === "string") {
    const match = body.image.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
    if (match) {
      const [, subtype, base64Data] = match;
      const approxBytes = Math.floor((base64Data.length * 3) / 4);
      if (approxBytes <= MAX_IMAGE_BYTES) {
        const ext = subtype === "jpeg" ? "jpg" : subtype;
        imageFilename = `${basePath}.${ext}`;
        const uploaded = await putGithubFile(env, imageFilename, base64Data, `Report image: ${title}`);
        if (!uploaded) return json({ error: "Failed to upload the image. Please try again." }, 502);
      }
    }
  }

  const frontmatterLines = [
    "---",
    `type: ${body.type}`,
    `title: ${JSON.stringify(title)}`,
    `created: ${new Date().toISOString()}`,
  ];
  if (imageFilename) frontmatterLines.push(`image: ${imageFilename.split("/").pop()}`);
  frontmatterLines.push("---", "");
  const markdown = `${frontmatterLines.join("\n")}\n${description}\n`;

  const filed = await putGithubFile(env, `${basePath}.md`, toBase64(markdown), `Report: ${title}`);
  if (!filed) return json({ error: "Failed to file the report. Please try again." }, 502);

  return json({ ok: true });
}

async function putGithubFile(env: Env, path: string, base64Content: string, message: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_REPORTS_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "kitchen-table-report-bot",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, content: base64Content }),
  });
  return res.ok;
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
