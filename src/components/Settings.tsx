import { useRef, useState } from "react";
import { useGame } from "../store/useGame";
import "./Settings.css";

const PLAYER_COLORS = ["#B2532F", "#3E7EAE", "#4C7350", "#8F6C1E", "#4B4258", "#A0527A"];

export default function Settings() {
  const identity = useGame((s) => s.identity);
  const setIdentity = useGame((s) => s.setIdentity);
  const playmats = useGame((s) => s.playmats);
  const selectedPlaymat = useGame((s) => s.selectedPlaymat);
  const selectPlaymat = useGame((s) => s.selectPlaymat);
  const addCustomPlaymat = useGame((s) => s.addCustomPlaymat);

  const [name, setName] = useState(identity.name);
  const fileInput = useRef<HTMLInputElement>(null);

  function commitName() {
    if (name.trim() && name !== identity.name) setIdentity({ ...identity, name: name.trim() });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        addCustomPlaymat(file.name.replace(/\.[a-z]+$/i, ""), reader.result).then((pm) => selectPlaymat(pm.id));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <section>
      <div className="screen-head">
        <h2>Settings</h2>
        <span className="sub">Table background is personal — it's not sent to other players</span>
      </div>

      <div className="settings-grid">
        <div>
          <label className="section-label">Playmat</label>
          <div className="swatch-row">
            {playmats.map((pm) => (
              <button
                key={pm.id}
                className={"swatch" + (selectedPlaymat === pm.id ? " selected" : "")}
                onClick={() => selectPlaymat(pm.id)}
              >
                <div
                  className="tile"
                  style={pm.kind === "builtin" ? { background: pm.css } : { backgroundImage: `url(${pm.image})`, backgroundSize: "cover" }}
                />
                <div className="lbl">{pm.name}</div>
              </button>
            ))}
            <button className="swatch upload" onClick={() => fileInput.current?.click()}>
              <div className="tile">+</div>
              <div className="lbl">Upload your own</div>
            </button>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={handleFile} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Display name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === "Enter" && commitName()} />
          </div>
          <div className="field">
            <label>Player color</label>
            <div className="color-row">
              {PLAYER_COLORS.map((c) => (
                <button
                  key={c}
                  className={"color-dot" + (identity.color === c ? " selected" : "")}
                  style={{ background: c }}
                  onClick={() => setIdentity({ ...identity, color: c })}
                  aria-label={`Choose color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="small-note">
          Uploaded backgrounds stay on your device — other players still see the same board state and cards, just against
          their own choice of background.
        </p>
      </div>
    </section>
  );
}
