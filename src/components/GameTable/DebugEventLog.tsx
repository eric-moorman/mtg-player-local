import { useEffect, useRef, useState } from "react";

/**
 * TEMPORARY diagnostic — not meant to stay in the app. Logs every raw
 * mousedown/mouseup/click/contextmenu event on the page directly on-screen,
 * plus whether the app's own .ctx-menu actually mounts into the DOM
 * afterward (via MutationObserver), since the usual suspects (native image
 * drag, trackpad gesture quirks, stale builds, dev vs. preview server,
 * React StrictMode) have all been ruled out.
 *
 * Note: defaultPrevented for contextmenu is read after a 0ms timeout, not
 * during capture — reading it during capture (before the target's own
 * bubble-phase handlers, including React's, have run) would always show
 * false regardless of what the app actually does with the event.
 */
export default function DebugEventLog() {
  const [lines, setLines] = useState<string[]>([]);
  const linesRef = useRef<string[]>([]);

  useEffect(() => {
    function push(line: string) {
      linesRef.current = [...linesRef.current.slice(-29), line];
      setLines(linesRef.current);
    }
    function describeTarget(target: EventTarget | null): string {
      const el = target as HTMLElement | null;
      const cls = el && typeof el.className === "string" ? el.className.trim() : "";
      const tag = el?.tagName?.toLowerCase() ?? "?";
      return cls ? `${tag}.${cls.split(/\s+/).join(".")}` : tag;
    }
    function ts() {
      return new Date().toISOString().slice(11, 23);
    }
    function log(e: Event) {
      const btn = e instanceof MouseEvent ? ` button=${e.button}` : "";
      push(`${ts()}  ${e.type.padEnd(11)} -> ${describeTarget(e.target)}${btn}`);
      if (e.type === "contextmenu") {
        const ev = e;
        setTimeout(() => {
          push(`${ts()}  (final) defaultPrevented=${ev.defaultPrevented}`);
        }, 0);
      }
    }
    const types = ["mousedown", "mouseup", "click", "contextmenu", "dragstart"];
    types.forEach((t) => window.addEventListener(t, log, true));

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (node instanceof HTMLElement && node.classList.contains("ctx-menu")) push(`${ts()}  >>> .ctx-menu MOUNTED`);
        }
        for (const node of Array.from(m.removedNodes)) {
          if (node instanceof HTMLElement && node.classList.contains("ctx-menu")) push(`${ts()}  <<< .ctx-menu REMOVED`);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      types.forEach((t) => window.removeEventListener(t, log, true));
      observer.disconnect();
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed", bottom: 8, right: 8, width: 480, maxHeight: 300, overflowY: "auto",
        background: "rgba(10, 10, 10, 0.92)", color: "#8f8", fontFamily: "monospace", fontSize: 11,
        padding: "8px 10px", borderRadius: 8, zIndex: 99999, whiteSpace: "pre", lineHeight: 1.5,
        pointerEvents: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ color: "#fff", fontWeight: 700, marginBottom: 4 }}>DEBUG event log (temporary) — click/right-click a card</div>
      {lines.length === 0 && <div style={{ color: "#888" }}>(waiting for input…)</div>}
      {lines.map((l, i) => {
        const highlight = l.includes("ctx-menu");
        return (
          <div key={i} style={highlight ? { color: "#ff0" } : undefined}>
            {l}
          </div>
        );
      })}
    </div>
  );
}
