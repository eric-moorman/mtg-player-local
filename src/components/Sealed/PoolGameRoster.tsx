import { useState } from "react";
import { useSealed } from "../../store/useSealed";
import { useAuth } from "../../store/useAuth";

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

/**
 * Who else is in this game and how they're doing. Deliberately money and counts
 * only — the Worker never sends another player's card list, so there's nothing
 * here that could leak what someone opened.
 */
export default function PoolGameRoster() {
  const game = useSealed((s) => s.game);
  const rules = useSealed((s) => s.rules);
  const players = useSealed((s) => s.players);
  const invitePlayers = useSealed((s) => s.invitePlayers);
  const user = useAuth((s) => s.user);

  const [inviteValue, setInviteValue] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  if (!game || !rules) return null;
  const isHost = user != null && game.hostUsername.toLowerCase() === user.username.toLowerCase();

  async function handleInvite() {
    const names = inviteValue.split(/[\s,]+/).map((n) => n.trim()).filter((n) => n.length > 0);
    if (names.length === 0) return;
    setInviting(true);
    setInviteError(null);
    try {
      await invitePlayers(names);
      setInviteValue("");
      setShowInvite(false);
    } catch (e: any) {
      setInviteError(e?.message ?? "Couldn't invite those players.");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="poolgame-roster-panel">
      <h3 className="sealed-subhead">Players ({players.length})</h3>
      <ul className="poolgame-roster">
        {players.map((p) => (
          <li key={p.userId} className={user && p.username.toLowerCase() === user.username.toLowerCase() ? "me" : undefined}>
            <span className="r-name">
              {p.username}
              {p.userId === game.hostUserId && <span className="r-host" title="Host">★</span>}
            </span>
            <span className="r-stat">{p.poolCount} cards</span>
            <span className="r-stat">{formatPrice(rules.budget - p.spent)} left</span>
            {p.finished && <span className="poolgame-badge done small">Done</span>}
          </li>
        ))}
      </ul>

      {isHost && (
        showInvite ? (
          <div className="poolgame-invite-form">
            <input
              type="text"
              placeholder="username, another_user"
              value={inviteValue}
              onChange={(e) => setInviteValue(e.target.value)}
              aria-label="Usernames to invite"
            />
            <div className="actions">
              <button className="btn primary" onClick={handleInvite} disabled={inviting || !inviteValue.trim()}>
                {inviting ? "Inviting…" : "Invite"}
              </button>
              <button className="btn" onClick={() => { setShowInvite(false); setInviteError(null); }}>Cancel</button>
            </div>
            {inviteError && <p className="report-error">{inviteError}</p>}
          </div>
        ) : (
          <button className="btn poolgame-invite-btn" onClick={() => setShowInvite(true)}>+ Invite a player</button>
        )
      )}
    </div>
  );
}
