import { useEffect, useState } from "react";
import "./ReportModal.css";

interface Props {
  onClose: () => void;
}

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

function approxBase64Bytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  return Math.floor((b64.length * 3) / 4);
}

async function compressImage(file: File): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read failed")));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode failed"));
    el.src = original;
  });

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let quality = JPEG_QUALITY;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (approxBase64Bytes(out) > 500_000 && quality > 0.4) {
    quality -= 0.15;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  return out;
}

export default function ReportModal({ onClose }: Props) {
  const [type, setType] = useState<"bug" | "feature">("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | undefined>(undefined);
  const [imageError, setImageError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError(null);
    try {
      setImage(await compressImage(file));
    } catch {
      setImageError("Couldn't read that image — try a different file.");
    }
  }

  async function submit() {
    if (!title.trim() || !description.trim()) return;
    setStatus("submitting");
    setErrorMessage("");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title: title.trim(), description: description.trim(), image, honeypot }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setStatus("done");
    } catch (e: any) {
      setStatus("error");
      setErrorMessage(e.message || "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="inspect-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="inspect-card report-modal">
        <button className="inspect-close" onClick={onClose} aria-label="Close">×</button>

        {status === "done" ? (
          <div className="inspect-info">
            <h3>Thanks!</h3>
            <p>Your {type === "bug" ? "bug report" : "feature request"} has been filed. Eric will take a look.</p>
            <button className="btn primary" onClick={onClose}>Close</button>
          </div>
        ) : (
          <div className="inspect-info">
            <h3>Report a bug / request a feature</h3>

            <div className="report-type-toggle">
              <button className={"btn" + (type === "bug" ? " primary" : "")} onClick={() => setType("bug")}>🐛 Bug</button>
              <button className={"btn" + (type === "feature" ? " primary" : "")} onClick={() => setType("feature")}>💡 Feature</button>
            </div>

            <label className="field">
              <span>Title</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === "bug" ? "e.g. Cards get stuck when dragged" : "e.g. Add a way to reorder my hand"} maxLength={200} />
            </label>

            <label className="field">
              <span>Description</span>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={type === "bug" ? "What happened, and what did you expect instead?" : "What would you like to be able to do?"}
                maxLength={4000}
              />
            </label>

            <label className="field">
              <span>Screenshot (optional)</span>
              <input type="file" accept="image/*" onChange={handleFile} />
              {image && <img className="report-preview" src={image} alt="Attached screenshot preview" />}
              {imageError && <span className="report-error">{imageError}</span>}
            </label>

            {/* Hidden from real people; a filled-in value means this came from a bot. */}
            <input
              type="text"
              name="website"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              className="honeypot"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />

            {status === "error" && <p className="report-error">{errorMessage}</p>}

            <button className="btn primary" onClick={submit} disabled={status === "submitting" || !title.trim() || !description.trim()}>
              {status === "submitting" ? "Sending…" : "Submit"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
