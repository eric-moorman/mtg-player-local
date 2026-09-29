// Turns each markdown file sitting directly in reports/ into a labeled GitHub
// Issue, then moves it into reports/archive/ so it isn't processed again.
// Runs with the workflow's own auto-provisioned GITHUB_TOKEN (via `gh`'s
// GH_TOKEN env var) — no secret to manage for this step at all.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const OWNER_REPO = "eric-moorman/mtg-player-local";
const REPORTS_DIR = "reports";
const ARCHIVE_DIR = path.join(REPORTS_DIR, "archive");

function ensureLabel(name, color, description) {
  try {
    execFileSync("gh", ["label", "create", name, "--color", color, "--description", description], { stdio: "pipe" });
  } catch {
    // Already exists — fine.
  }
}

function parseReport(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const [, frontmatterRaw, body] = match;
  const fields = {};
  for (const line of frontmatterRaw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        // leave as-is
      }
    }
    fields[key] = value;
  }
  return { fields, body: body.trim() };
}

ensureLabel("bug", "d73a4a", "A reported bug");
ensureLabel("enhancement", "a2eeef", "A requested feature");
ensureLabel("agent-ready", "0e8a16", "Greenlit for the coding agent to attempt");

if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });

const files = readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".md"));

for (const file of files) {
  const fullPath = path.join(REPORTS_DIR, file);
  const parsed = parseReport(readFileSync(fullPath, "utf8"));
  if (!parsed) {
    console.error(`Skipping ${file}: couldn't parse frontmatter`);
    continue;
  }

  const { fields, body } = parsed;
  const label = fields.type === "bug" ? "bug" : "enhancement";
  const title = fields.title || "Untitled report";

  let issueBody = body;
  if (fields.image) {
    const imageUrl = `https://raw.githubusercontent.com/${OWNER_REPO}/main/${REPORTS_DIR}/${fields.image}`;
    issueBody += `\n\n![attached image](${imageUrl})`;
  }
  issueBody += "\n\n---\n_Filed automatically from an in-app report._";

  const tmpFile = path.join("/tmp", `issue-body-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  writeFileSync(tmpFile, issueBody, "utf8");

  execFileSync("gh", ["issue", "create", "--title", title, "--body-file", tmpFile, "--label", label], {
    stdio: "inherit",
  });

  renameSync(fullPath, path.join(ARCHIVE_DIR, file));
}
