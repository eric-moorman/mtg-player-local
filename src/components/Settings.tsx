import { useEffect, useRef, useState } from "react";
import { useGame } from "../store/useGame";
import { useAuth } from "../store/useAuth";
import { refreshAllFromAuthState } from "../lib/accountSync";
import "./Settings.css";

const PLAYER_COLORS = ["#B2532F", "#3E7EAE", "#4C7350", "#8F6C1E", "#4B4258", "#A0527A"];

function AccountSection() {
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const error = useAuth((s) => s.error);
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const logout = useAuth((s) => s.logout);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = mode === "login" ? await login(username, password) : await register(username, password);
    if (ok) {
      setUsername("");
      setPassword("");
      await refreshAllFromAuthState();
    }
    setBusy(false);
  }

  async function handleSignOut() {
    setBusy(true);
    await logout();
    await refreshAllFromAuthState();
    setBusy(false);
  }

  if (status === "checking") {
    return (
      <div className="account-card">
        <label className="section-label">Account</label>
        <p className="small-note">Checking sign-in status…</p>
      </div>
    );
  }

  if (user) {
    return (
      <div className="account-card" data-tour="settings-account">
        <label className="section-label">Account</label>
        <p className="small-note">
          Synced as <strong>{user.username}</strong> — decks, identity, playmat, and sealed-pool settings follow you to any
          device you sign in on.
        </p>
        <button className="btn" onClick={handleSignOut} disabled={busy}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="account-card" data-tour="settings-account">
      <label className="section-label">Account</label>
      <p className="small-note">
        Optional — everything works fine without one. Sign in to sync decks and preferences across devices.
      </p>
      <form className="field-row account-form" onSubmit={submit}>
        <div className="field">
          <label>Username</label>
          <input
            className="account-username-input" type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            autoComplete="username" minLength={3} maxLength={32} required
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            className="account-password-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required
          />
        </div>
        <div className="field">
          <button className="btn primary" type="submit" disabled={busy}>
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </div>
      </form>
      {error && <p className="account-error">{error}</p>}
      <button className="account-toggle" type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}

export default function Settings() {
  const identity = useGame((s) => s.identity);
  const setIdentity = useGame((s) => s.setIdentity);
  const playmats = useGame((s) => s.playmats);
  const selectedPlaymat = useGame((s) => s.selectedPlaymat);
  const selectPlaymat = useGame((s) => s.selectPlaymat);
  const addCustomPlaymat = useGame((s) => s.addCustomPlaymat);

  const [name, setName] = useState(identity.name);
  const fileInput = useRef<HTMLInputElement>(null);

  // identity can now change from outside this component's own input (sign-in/out swaps
  // between local and cloud identity) — keep the field's local state in sync with it.
  useEffect(() => {
    setName(identity.name);
  }, [identity.name]);

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
        <AccountSection />

        <div data-tour="settings-playmat">
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

        <div className="field-row" data-tour="settings-identity">
          <div className="field">
            <label>Display name</label>
            <input
              className="display-name-input" type="text" value={name}
              onChange={(e) => setName(e.target.value)} onBlur={commitName}
              onKeyDown={(e) => e.key === "Enter" && commitName()}
            />
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
