import { useState } from "react";
import { useGame } from "../store/useGame";
import "./Lobby.css";

export default function Lobby() {
  const role = useGame((s) => s.role);
  const roomCode = useGame((s) => s.roomCode);
  const gameState = useGame((s) => s.gameState);
  const myId = useGame((s) => s.myId);
  const connectError = useGame((s) => s.connectError);
  const decks = useGame((s) => s.decks);
  const selectedDeckId = useGame((s) => s.selectedDeckId);
  const deckLoading = useGame((s) => s.deckLoading);
  const hostGame = useGame((s) => s.hostGame);
  const joinGame = useGame((s) => s.joinGame);
  const leaveGame = useGame((s) => s.leaveGame);
  const setStartingLife = useGame((s) => s.setStartingLife);
  const selectDeckForGame = useGame((s) => s.selectDeckForGame);
  const setReady = useGame((s) => s.setReady);
  const requestStart = useGame((s) => s.requestStart);
  const setScreen = useGame((s) => s.setScreen);

  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<"host" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = gameState?.players.find((p) => p.id === myId);

  async function handleHost() {
    setBusy("host");
    setError(null);
    try {
      await hostGame();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't start a room.");
    } finally {
      setBusy(null);
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setBusy("join");
    setError(null);
    try {
      await joinGame(joinCode);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't join that room.");
    } finally {
      setBusy(null);
    }
  }

  if (role === "offline") {
    return (
      <section>
        <div className="screen-head">
          <h2>Lobby</h2>
          <span className="sub">Create or join a table — the room code is the only shared secret</span>
        </div>

        <div className="lobby-grid">
          <div className="lobby-card" data-tour="lobby-create">
            <h3>Create a game</h3>
            <p>Start a table and share the code with friends. You'll act as host.</p>
            <button className="btn primary" disabled={busy !== null} onClick={handleHost}>
              {busy === "host" ? "Starting…" : "Create game"}
            </button>
          </div>
          <div className="lobby-card" data-tour="lobby-join">
            <h3>Join a game</h3>
            <p>Enter the code a friend sent you to connect directly to their table.</p>
            <input
              type="text"
              placeholder="e.g. FOX-41-WREN"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            <button className="btn primary" disabled={busy !== null} onClick={handleJoin}>
              {busy === "join" ? "Joining…" : "Join table"}
            </button>
          </div>
        </div>

        {error && <p className="lobby-error">{error}</p>}

        <p className="foot-note">
          Connections are made directly between browsers. A public handshake service only helps two players find each
          other once — after that, nothing about your game passes through a server.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="screen-head">
        <h2>Lobby</h2>
        <span className="sub">{role === "host" ? "You're hosting" : "Connected as guest"}</span>
      </div>

      <div className="lobby-grid">
        <div className="lobby-card">
          <h3>Room code</h3>
          <p>Share this with friends so they can join directly.</p>
          <div className="room-code">{roomCode}</div>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(roomCode ?? "")}>Copy code</button>
        </div>

        <div className="lobby-card">
          <h3>Your deck</h3>
          <p>Pick one of your saved decks before you're ready.</p>
          <select value={selectedDeckId ?? ""} onChange={(e) => e.target.value && selectDeckForGame(e.target.value)}>
            <option value="" disabled>Choose a deck…</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {decks.length === 0 && (
            <p className="hint">No decks yet — build one in <button className="linklike" onClick={() => setScreen("deckbuilder")}>Deck Builder</button>.</p>
          )}
          <label className="ready-check">
            <input type="checkbox" checked={me?.ready ?? false} onChange={(e) => setReady(e.target.checked)} disabled={!selectedDeckId || deckLoading} />
            {deckLoading ? "Loading deck…" : "Ready"}
          </label>
        </div>
      </div>

      {role === "host" && (() => {
        const connected = gameState?.players.filter((p) => p.connected) ?? [];
        const allReady = connected.length > 0 && connected.every((p) => p.ready);
        return (
          <div className="lobby-card host-controls">
            <h3>Host controls</h3>
            <div className="field-row">
              <label className="field">
                <span>Starting life</span>
                <input
                  type="number"
                  min={1}
                  value={gameState?.startingLife ?? 20}
                  onChange={(e) => setStartingLife(Number(e.target.value) || 20)}
                />
              </label>
              <button className="btn primary" disabled={gameState?.started || !allReady} onClick={requestStart}>
                {gameState?.started ? "Game in progress" : "Start game"}
              </button>
            </div>
            {!allReady && !gameState?.started && <p className="hint">Waiting for everyone at the table to pick a deck and ready up.</p>}
          </div>
        );
      })()}

      <div className="players">
        <h3>At the table</h3>
        {gameState?.players.map((p) => (
          <div className="player-row" key={p.id}>
            <div className="avatar" style={{ background: p.color }}>{p.name.slice(0, 1).toUpperCase()}</div>
            <div className="name">
              {p.name}
              {p.isHost && <span className="dim"> — host</span>}
            </div>
            <span className="conn">
              <span className="dot" style={{ background: p.connected ? "var(--good)" : "var(--text-dim)" }} />
              {p.connected ? (p.ready ? "ready" : "not ready") : "disconnected"}
            </span>
          </div>
        ))}
      </div>

      {connectError && <p className="lobby-error">{connectError}</p>}

      {gameState?.started && (
        <p className="foot-note">
          The game has started. Head to the <button className="linklike" onClick={() => setScreen("table")}>Game Table</button>.
        </p>
      )}

      <button className="btn danger" onClick={leaveGame}>Leave table</button>
    </section>
  );
}
