import { useEffect, useState } from "react";
import { useSealed } from "../../store/useSealed";
import { useAuth } from "../../store/useAuth";
import { useGame } from "../../store/useGame";
import type { PoolGameListEntry } from "../../lib/types";

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function SealedGameList() {
  const games = useSealed((s) => s.games);
  const gamesStatus = useSealed((s) => s.gamesStatus);
  const listError = useSealed((s) => s.listError);
  const loadError = useSealed((s) => s.loadError);
  const refreshGames = useSealed((s) => s.refreshGames);
  const openGame = useSealed((s) => s.openGame);
  const deleteGame = useSealed((s) => s.deleteGame);
  const showSetup = useSealed((s) => s.showSetup);
  const user = useAuth((s) => s.user);
  const setScreen = useGame((s) => s.setScreen);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    refreshGames();
  }, [refreshGames, user?.username]);

  if (!user) {
    return (
      <section data-tour="sealed-main">
        <div className="screen-head">
          <h2>Sealed Pool</h2>
          <span className="sub">Buy cards against a budget and build a deck from what you get</span>
        </div>
        <div className="lobby-card" style={{ maxWidth: 520 }}>
          <h3>Sign in to play</h3>
          <p>
            Pool games save as you go, so you can close the tab and pick up where you left off — and invite friends to
            play the same pool rules. Both of those need an account to hang your progress on.
          </p>
          <div className="actions">
            <button className="btn primary" onClick={() => setScreen("settings")}>Sign in or create an account</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section data-tour="sealed-main">
      <div className="screen-head">
        <h2>Sealed Pool</h2>
        <span className="sub">Buy cards against a budget and build a deck from what you get — your progress saves automatically</span>
      </div>

      <div className="poolgame-list-head">
        <h3 className="sealed-subhead">Your pool games</h3>
        <button className="btn primary" onClick={showSetup}>+ New pool game</button>
      </div>

      {loadError && <p className="report-error">{loadError}</p>}
      {listError && <p className="report-error">{listError}</p>}

      {gamesStatus === "loading" && <p className="hint">Loading your pool games…</p>}

      {gamesStatus === "ready" && games.length === 0 && (
        <div className="lobby-card" style={{ maxWidth: 520 }}>
          <h3>No pool games yet</h3>
          <p>
            Start one to set a budget, choose which sets your packs come from, and tune the rarity odds. You can run
            several at once, and invite friends to play by the exact same rules.
          </p>
          <div className="actions">
            <button className="btn primary" onClick={showSetup}>Create your first pool game</button>
          </div>
        </div>
      )}

      <div className="poolgame-grid">
        {games.map((entry) => (
          <GameCard
            key={entry.meta.id}
            entry={entry}
            myUserId={entry.me?.userId ?? null}
            onOpen={() => openGame(entry.meta.id)}
            confirming={confirmDelete === entry.meta.id}
            onAskDelete={() => setConfirmDelete(entry.meta.id)}
            onCancelDelete={() => setConfirmDelete(null)}
            onConfirmDelete={() => {
              setConfirmDelete(null);
              deleteGame(entry.meta.id);
            }}
          />
        ))}
      </div>
    </section>
  );
}

interface GameCardProps {
  entry: PoolGameListEntry;
  myUserId: string | null;
  onOpen: () => void;
  confirming: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function GameCard({ entry, myUserId, onOpen, confirming, onAskDelete, onCancelDelete, onConfirmDelete }: GameCardProps) {
  const { meta, players, me } = entry;
  const isHost = meta.hostUserId === myUserId;
  const remaining = meta.settings.budget - (me?.spent ?? 0);
  const multiplayer = players.length > 1;

  return (
    <div className={"poolgame-card" + (me?.finished ? " finished" : "")}>
      <div className="poolgame-card-head">
        <h4>{meta.name}</h4>
        {me?.finished && <span className="poolgame-badge done">Complete</span>}
      </div>

      <div className="poolgame-meta">
        <span>{formatDate(meta.createdAt)}</span>
        <span>·</span>
        <span>{meta.settings.allowedSets.length} {meta.settings.allowedSets.length === 1 ? "set" : "sets"}</span>
        <span>·</span>
        <span>{formatPrice(meta.settings.packPrice)}/pack</span>
        {!isHost && (
          <>
            <span>·</span>
            <span>hosted by {meta.hostUsername}</span>
          </>
        )}
      </div>

      <div className="poolgame-stats">
        <div className="poolgame-stat">
          <span className="n">{formatPrice(Math.max(0, remaining))}</span>
          <span className="l">left of {formatPrice(meta.settings.budget)}</span>
        </div>
        <div className="poolgame-stat">
          <span className="n">{me?.poolCount ?? 0}</span>
          <span className="l">cards in pool</span>
        </div>
        <div className="poolgame-stat">
          <span className="n">{me?.deckCount ?? 0}</span>
          <span className="l">in deck</span>
        </div>
      </div>

      {multiplayer && (
        <ul className="poolgame-roster compact">
          {players.map((p) => (
            <li key={p.userId} className={p.userId === myUserId ? "me" : undefined}>
              <span className="r-name">
                {p.username}
                {p.userId === meta.hostUserId && <span className="r-host" title="Host">★</span>}
              </span>
              <span className="r-stat">{p.poolCount} cards</span>
              <span className="r-stat">{formatPrice(meta.settings.budget - p.spent)} left</span>
              {p.finished && <span className="poolgame-badge done small">Done</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="poolgame-card-actions">
        <button className="btn primary" onClick={onOpen}>
          {me?.finished ? "View pool" : (me?.poolCount ?? 0) > 0 ? "Resume" : "Start opening packs"}
        </button>
        {confirming ? (
          <span className="poolgame-confirm">
            {isHost ? "Delete for everyone?" : "Leave this game?"}
            <button className="btn danger" onClick={onConfirmDelete}>Yes</button>
            <button className="btn" onClick={onCancelDelete}>No</button>
          </span>
        ) : (
          <button className="btn" onClick={onAskDelete} title={isHost ? "Delete this game for all players" : "Leave this game"}>
            {isHost ? "Delete" : "Leave"}
          </button>
        )}
      </div>
    </div>
  );
}
