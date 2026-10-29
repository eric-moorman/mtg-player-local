import { useBanDraft } from "../../store/useBanDraft";
import { useAuth } from "../../store/useAuth";

export default function BanDraftSetup() {
  const draftName = useBanDraft((s) => s.draftName);
  const setDraftName = useBanDraft((s) => s.setDraftName);
  const draftCardsPerPack = useBanDraft((s) => s.draftCardsPerPack);
  const setDraftCardsPerPack = useBanDraft((s) => s.setDraftCardsPerPack);
  const draftInvites = useBanDraft((s) => s.draftInvites);
  const setDraftInvites = useBanDraft((s) => s.setDraftInvites);
  const loadError = useBanDraft((s) => s.loadError);
  const createGame = useBanDraft((s) => s.createGame);
  const cancelSetup = useBanDraft((s) => s.cancelSetup);
  const user = useAuth((s) => s.user);

  // One ban per other player, so this is what's left to choose from at the end.
  const invitedCount = draftInvites.split(/[\s,]+/).filter((n) => n.trim().length > 0).length;
  const players = invitedCount + 1;
  const survivors = draftCardsPerPack - (players - 1);

  return (
    <section>
      <div className="screen-head">
        <h2>New commander draft</h2>
        <span className="sub">Invite everyone now — seats lock in when you deal the packs</span>
      </div>

      <div className="bandraft-setup">
        <div className="filter-block">
          <label htmlFor="bandraft-name">Draft name</label>
          <input
            id="bandraft-name"
            type="text"
            placeholder="Friday night commanders"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
        </div>

        <div className="filter-block">
          <label htmlFor="bandraft-size">Commanders per pack</label>
          <input
            id="bandraft-size"
            type="number"
            min={2}
            max={30}
            value={draftCardsPerPack}
            onChange={(e) => setDraftCardsPerPack(Number(e.target.value))}
          />
          <p className="hint">
            Every other player bans one card out of your pack, so with {players} {players === 1 ? "player" : "players"}{" "}
            you'd be choosing from{" "}
            {survivors > 0 ? <b>{survivors}</b> : <b>nothing — make the packs bigger</b>}
            {survivors > 0 && ` of the ${draftCardsPerPack}`}. Packs never overlap, so nobody is offered the same
            commander as you.
          </p>
        </div>

        <div className="filter-block">
          <label htmlFor="bandraft-invites">Invite players</label>
          <input
            id="bandraft-invites"
            type="text"
            placeholder="username, another_user"
            value={draftInvites}
            onChange={(e) => setDraftInvites(e.target.value)}
          />
          <p className="hint">
            Their Kitchen Table usernames, separated by commas. You can keep inviting people right up until you deal.
            {user && <> You're playing as <b>{user.username}</b>.</>}
          </p>
        </div>

        {loadError && <p className="report-error">{loadError}</p>}

        <div className="actions">
          <button className="btn primary" onClick={createGame}>Create draft</button>
          <button className="btn" onClick={cancelSetup}>Cancel</button>
        </div>
      </div>
    </section>
  );
}
