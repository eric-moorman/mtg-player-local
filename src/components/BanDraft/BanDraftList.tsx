import { useEffect, useState } from "react";
import { useBanDraft } from "../../store/useBanDraft";
import { useAuth } from "../../store/useAuth";
import { useGame } from "../../store/useGame";
import type { BanDraftListEntry } from "../../lib/types";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function BanDraftList() {
  const games = useBanDraft((s) => s.games);
  const gamesStatus = useBanDraft((s) => s.gamesStatus);
  const listError = useBanDraft((s) => s.listError);
  const loadError = useBanDraft((s) => s.loadError);
  const refreshGames = useBanDraft((s) => s.refreshGames);
  const openGame = useBanDraft((s) => s.openGame);
  const deleteGame = useBanDraft((s) => s.deleteGame);
  const showSetup = useBanDraft((s) => s.showSetup);
  const user = useAuth((s) => s.user);
  const setScreen = useGame((s) => s.setScreen);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    refreshGames();
  }, [refreshGames, user?.username]);

  if (!user) {
    return (
      <section>
        <div className="screen-head">
          <h2>Commander Draft</h2>
          <span className="sub">Open a pack of commanders, pass it round the table, pick from what survives</span>
        </div>
        <div className="lobby-card" style={{ maxWidth: 520 }}>
          <h3>Sign in to play</h3>
          <p>
            A commander draft runs across several people over however long it takes — packs sit waiting for whoever is
            next. That needs accounts to pass them between.
          </p>
          <div className="actions">
            <button className="btn primary" onClick={() => setScreen("settings")}>Sign in or create an account</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="screen-head">
        <h2>Commander Draft</h2>
        <span className="sub">
          Everyone opens a pack of commanders. It goes round the table and each player bans one card out of it — you
          choose your commander from whatever makes it home.
        </span>
      </div>

      <div className="bandraft-list-head">
        <h3>Your drafts</h3>
        <button className="btn primary" onClick={showSetup}>+ New commander draft</button>
      </div>

      {loadError && <p className="report-error">{loadError}</p>}
      {listError && <p className="report-error">{listError}</p>}

      {gamesStatus === "loading" && <p className="hint">Loading your commander drafts…</p>}

      {gamesStatus === "ready" && games.length === 0 && (
        <div className="lobby-card" style={{ maxWidth: 520 }}>
          <h3>No commander drafts yet</h3>
          <p>
            Start one, invite the people you play with, and deal the packs. Everyone sees their own pack first, then it
            travels round the table collecting a ban from each player before it comes back for the final choice.
          </p>
          <div className="actions">
            <button className="btn primary" onClick={showSetup}>Create your first draft</button>
          </div>
        </div>
      )}

      <div className="bandraft-grid">
        {games.map((entry) => (
          <DraftCard
            key={entry.meta.id}
            entry={entry}
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

interface DraftCardProps {
  entry: BanDraftListEntry;
  onOpen: () => void;
  confirming: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function DraftCard({ entry, onOpen, confirming, onAskDelete, onCancelDelete, onConfirmDelete }: DraftCardProps) {
  const { meta, yourTurn, picked, total, complete, myCommander } = entry;
  const user = useAuth((s) => s.user);
  const isHost = user != null && meta.hostUsername.toLowerCase() === user.username.toLowerCase();

  const openLabel = !meta.started
    ? isHost ? "Open and deal" : "Open"
    : yourTurn ? "Take your turn"
    : complete ? "See the results"
    : "Check the table";

  return (
    <div className={"bandraft-card" + (yourTurn ? " yours" : "") + (complete ? " complete" : "")}>
      <div className="bandraft-card-head">
        <h4>{meta.name}</h4>
        {complete ? (
          <span className="bandraft-badge done">Complete</span>
        ) : yourTurn ? (
          <span className="bandraft-badge turn">Your turn</span>
        ) : meta.started ? (
          <span className="bandraft-badge waiting">Waiting</span>
        ) : (
          <span className="bandraft-badge">Not dealt</span>
        )}
      </div>

      <div className="bandraft-meta">
        <span>{formatDate(meta.createdAt)}</span>
        <span>·</span>
        <span>{meta.members.length} {meta.members.length === 1 ? "player" : "players"}</span>
        <span>·</span>
        <span>{meta.settings.cardsPerPack} per pack</span>
        {!isHost && (
          <>
            <span>·</span>
            <span>hosted by {meta.hostUsername}</span>
          </>
        )}
      </div>

      <p className="hint" style={{ margin: 0 }}>
        {!meta.started
          ? isHost
            ? "Invite everyone first — seats lock when you deal."
            : `Waiting for ${meta.hostUsername} to deal the packs.`
          : myCommander
            ? `Your commander: ${myCommander}`
            : `${picked} of ${total} commanders chosen.`}
      </p>

      <div className="bandraft-card-actions">
        <button className="btn primary" onClick={onOpen}>{openLabel}</button>
        {confirming ? (
          <span className="poolgame-confirm">
            {isHost ? "Delete for everyone?" : "Leave this draft?"}
            <button className="btn danger" onClick={onConfirmDelete}>Yes</button>
            <button className="btn" onClick={onCancelDelete}>No</button>
          </span>
        ) : (
          <button className="btn" onClick={onAskDelete} title={isHost ? "Delete this draft for all players" : "Leave this draft"}>
            {isHost ? "Delete" : "Leave"}
          </button>
        )}
      </div>
    </div>
  );
}
