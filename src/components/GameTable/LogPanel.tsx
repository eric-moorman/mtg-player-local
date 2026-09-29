import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "../../lib/types";

interface Props {
  log: LogEntry[];
  onSend: (text: string) => void;
}

export default function LogPanel({ log, onSend }: Props) {
  const [text, setText] = useState("");
  const linesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    linesRef.current?.scrollTo({ top: linesRef.current.scrollHeight });
  }, [log.length]);

  function send() {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  }

  return (
    <div className="log-panel">
      <h3>Table log</h3>
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
    </div>
  );
}
