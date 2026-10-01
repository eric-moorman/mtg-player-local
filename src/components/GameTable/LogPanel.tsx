import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "../../lib/types";

interface Props {
  log: LogEntry[];
  onSend: (text: string) => void;
}

const STORAGE_KEY = "kt-log-collapsed";

export default function LogPanel({ log, onSend }: Props) {
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");
  const linesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    linesRef.current?.scrollTo({ top: linesRef.current.scrollHeight });
  }, [log.length]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function send() {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  }

  return (
    <div className={"log-panel" + (collapsed ? " collapsed" : "")}>
      <button className="log-panel-head" onClick={toggleCollapsed} aria-expanded={!collapsed}>
        <h3>Table log</h3>
        <span className="log-toggle-icon">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && (
        <>
          <div className="log-lines" ref={linesRef}>
            {log.map((entry) => (
              <div className="log-line" key={entry.id}>
                <span className="who">{entry.who}</span> {entry.text}
                {entry.card && (
                  <span className="log-card">
                    {entry.card.image_small && <img src={entry.card.image_small} alt={entry.card.name} />}
                    {entry.card.name}
                  </span>
                )}
              </div>
            ))}
            {log.length === 0 && <p className="hint">Nothing has happened yet.</p>}
          </div>
          <div className="log-input">
            <input
              type="text"
              placeholder="Log an action or say something…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button className="btn primary" onClick={send}>Send</button>
          </div>
        </>
      )}
    </div>
  );
}
