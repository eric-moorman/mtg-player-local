import { useEffect, useRef, useState } from "react";

/**
 * TEMPORARY diagnostic — not meant to stay in the app. Logs every raw
 * mousedown/mouseup/click/contextmenu event on the page (capture phase, so
 * nothing upstream can hide it from us) directly on-screen, since the usual
 * suspects (native image drag, trackpad gesture quirks, stale builds, dev
 * vs. preview server, React StrictMode) have all been ruled out and the
 * remaining explanation space needs real visibility into what's actually
 * firing on the user's own machine.
 */
export default function DebugEventLog() {
  const [lines, setLines] = useState<string[]>([]);
  const linesRef = useRef<string[]>([]);

  useEffect(() => {
    function describe(e: Event): string {
      const target = e.target as HTMLElement | null;
      const cls = target && typeof target.className === "string" ? target.className.trim() : "";
      const tag = target?.tagName?.toLowerCase() ?? "?";
      const sel = cls ? `${tag}.${cls.split(/\s+/).join(".")}` : tag;
      const extra = e.type === "contextmenu" ? ` defaultPrevented=${e.defaultPrevented}` : "";
      const btn = e instanceof MouseEvent ? ` button=${e.button}` : "";
      return `${new Date().toISOString().slice(11, 23)}  ${e.type.padEnd(11)} -> ${sel}${btn}${extra}`;
    }
    function log(e: Event) {
      linesRef.current = [...linesRef.current.slice(-24), describe(e)];
      setLines(linesRef.current);
    }
    const types = ["mousedown", "mouseup", "click", "contextmenu", "dragstart"];
    types.forEach((t) => window.addEventListener(t, log, true));
    return () => types.forEach((t) => window.removeEventListener(t, log, true));
  }, []);

  return (
    <div
      style={{
        position: "fixed", bottom: 8, right: 8, width: 460, maxHeight: 260, overflowY: "auto",
        background: "rgba(10, 10, 10, 0.92)", color: "#8f8", fontFamily: "monospace", fontSize: 11,
        padding: "8px 10px", borderRadius: 8, zIndex: 99999, whiteSpace: "pre", lineHeight: 1.5,
        pointerEvents: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ color: "#fff", fontWeight: 700, marginBottom: 4 }}>DEBUG event log (temporary) — click/right-click a card</div>
      {lines.length === 0 && <div style={{ color: "#888" }}>(waiting for input…)</div>}
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}
