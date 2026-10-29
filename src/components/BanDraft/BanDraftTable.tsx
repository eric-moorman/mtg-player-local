import { useState } from "react";
import { useBanDraft } from "../../store/useBanDraft";
import { useInspector } from "../../store/useInspector";
import * as draft from "../../lib/banDraft";
import type { BanDraftPack, CardData } from "../../lib/types";

/**
 * The draft itself. Everything the player can do is driven off `packsAwaiting`:
 * if a pack is in front of you, you act on it, and if none is, you're watching
 * the table. The store polls while this is mounted, so a pack arriving from
 * another player just appears.
 */
export default function BanDraftTable() {
  const meta = useBanDraft((s) => s.meta);
  const packs = useBanDraft((s) => s.packs);
  const myUserId = useBanDraft((s) => s.myUserId);
  const actionError = useBanDraft((s) => s.actionError);
  const busy = useBanDraft((s) => s.busy);
  const startProgress = useBanDraft((s) => s.startProgress);
  const selectedCardId = useBanDraft((s) => s.selectedCardId);
  const selectCard = useBanDraft((s) => s.selectCard);
  const closeGame = useBanDraft((s) => s.closeGame);
  const startDraft = useBanDraft((s) => s.startDraft);
  const passPack = useBanDraft((s) => s.passPack);
  const banCard = useBanDraft((s) => s.banCard);
  const pickCommander = useBanDraft((s) => s.pickCommander);

  if (!meta || !myUserId) return null;

  const isHost = meta.hostUserId === myUserId;
  const waiting = draft.packsAwaiting(meta, packs, myUserId);
  const current = waiting[0] ?? null;
  const complete = meta.started && packs.length > 0 && packs.every((p) => p.pickedCardId);

  return (
    <section>
      <div className="screen-head bandraft-head">
        <div>
          <h2>{meta.name}</h2>
          <span className="sub">
            {!meta.started
              ? "Not dealt yet"
              : complete
                ? "Every commander is chosen — that's the draft"
                : `${packs.filter((p) => p.pickedCardId).length} of ${packs.length} commanders chosen`}
          </span>
        </div>
        <div className="bandraft-head-actions">
          <button className="btn" onClick={closeGame}>← All drafts</button>
        </div>
      </div>

      {actionError && <p className="report-error">{actionError}</p>}

      {!meta.started && <NotDealtYet isHost={isHost} busy={busy} startProgress={startProgress} onStart={startDraft} />}

      {meta.started && complete && <Results packs={packs} myUserId={myUserId} />}

      {meta.started && !complete && !current && <NothingToDo />}

      {meta.started && !complete && current && (
        <ActivePack
          pack={current}
          extraWaiting={waiting.length - 1}
          busy={busy}
          selectedCardId={selectedCardId}
          onSelect={selectCard}
          onPass={() => passPack(current)}
          onBan={(id) => banCard(current, id)}
          onPick={(id) => pickCommander(current, id)}
        />
      )}

      <TablePanel />
    </section>
  );
}

function NotDealtYet({
  isHost,
  busy,
  startProgress,
  onStart,
}: {
  isHost: boolean;
  busy: boolean;
  startProgress: string | null;
  onStart: () => void;
}) {
  const meta = useBanDraft((s) => s.meta)!;

  return (
    <div className="bandraft-prompt idle">
      <h3>{isHost ? "Ready when you are" : `Waiting for ${meta.hostUsername} to deal`}</h3>
      <p>
        {isHost
          ? `Dealing gives all ${meta.members.length} ${meta.members.length === 1 ? "player" : "players"} a pack of ${meta.settings.cardsPerPack} commanders and locks the seats, so invite anyone else first.`
          : "You'll see your pack here as soon as the host deals. Nothing to do until then."}
      </p>
      {isHost && (
        <div className="actions">
          <button className="btn primary" onClick={onStart} disabled={busy}>
            {busy ? "Dealing…" : "Deal the packs"}
          </button>
        </div>
      )}
      {startProgress && <p className="hint">{startProgress}</p>}
    </div>
  );
}

function NothingToDo() {
  return (
    <div className="bandraft-prompt idle">
      <h3>Nothing in front of you right now</h3>
      <p>Every pack you've seen has moved on. This page checks for a new one every few seconds.</p>
    </div>
  );
}

interface ActivePackProps {
  pack: BanDraftPack;
  extraWaiting: number;
  busy: boolean;
  selectedCardId: string | null;
  onSelect: (id: string | null) => void;
  onPass: () => void;
  onBan: (cardId: string) => void;
  onPick: (cardId: string) => void;
}

function ActivePack({ pack, extraWaiting, busy, selectedCardId, onSelect, onPass, onBan, onPick }: ActivePackProps) {
  const meta = useBanDraft((s) => s.meta)!;
  const openInspector = useInspector((s) => s.open);
  const action = draft.packAction(meta, pack);
  const live = draft.liveCards(pack);
  const selected = live.find((c) => c.id === selectedCardId) ?? null;

  const seat = meta.members.findIndex((m) => m.userId === pack.ownerUserId);
  const nextHolder = meta.members[(seat + pack.position + 1) % meta.members.length];
  // With one seat at the table the pack never actually goes anywhere, so don't
  // promise it will — the next step is the owner picking from it.
  const passGoesToSomeoneElse = meta.members.length > 1;

  const heading =
    action === "look"
      ? "Your pack"
      : action === "ban"
        ? `${pack.ownerUsername}'s pack`
        : "Your pack is back";

  const blurb =
    action === "look"
      ? passGoesToSomeoneElse
        ? `Have a look at what you opened. When you pass it on, ${nextHolder.username} and everyone after them bans one card out of it before it comes back to you.`
        : "Have a look at what you opened. With nobody else at the table it comes straight back for you to choose from."
      : action === "ban"
        ? `Ban one commander out of it, then it moves on to ${nextHolder.username}. Pick the one you'd least like to see across the table.`
        : `The table banned ${pack.bans.length} of the ${pack.cards.length}. Choose your commander from what's left.`;

  return (
    <>
      <div className="bandraft-prompt">
        <h3>{heading}</h3>
        <p>{blurb}</p>
        {extraWaiting > 0 && (
          <p>
            <b>
              {extraWaiting} more {extraWaiting === 1 ? "pack is" : "packs are"} waiting behind this one.
            </b>
          </p>
        )}
      </div>

      <div className="bandraft-cards">
        {pack.cards.map((card) => {
          const ban = draft.bannerOf(pack, card.id);
          const selectable = action !== "look" && !ban;
          return (
            <CardTile
              key={card.id}
              card={card}
              bannedBy={ban?.byUsername ?? null}
              selected={card.id === selectedCardId}
              onClick={() => (selectable ? onSelect(card.id === selectedCardId ? null : card.id) : openInspector(card))}
            />
          );
        })}
      </div>

      <div className="bandraft-confirm">
        {action === "look" ? (
          <>
            <span className="bandraft-confirm-note">
              Click any card to read it in full. Nothing is banned yet.
            </span>
            <button className="btn primary" onClick={onPass} disabled={busy}>
              {busy ? "Passing…" : passGoesToSomeoneElse ? `Pass to ${nextHolder.username}` : "Done looking — bring it back"}
            </button>
          </>
        ) : (
          <>
            <span className="bandraft-confirm-note">
              {selected ? (
                <>
                  Selected: <b>{selected.name}</b>.{" "}
                  <button className="btn bandraft-read-btn" onClick={() => openInspector(selected)}>Read the card</button>
                </>
              ) : (
                `Click a card to choose it${action === "ban" ? " to ban" : ""}.`
              )}
            </span>
            <button
              className="btn primary"
              onClick={() => selected && (action === "ban" ? onBan(selected.id) : onPick(selected.id))}
              disabled={busy || !selected}
            >
              {busy
                ? action === "ban" ? "Banning…" : "Locking in…"
                : action === "ban"
                  ? selected ? `Ban ${selected.name}` : "Ban a card"
                  : selected ? `Lock in ${selected.name}` : "Choose your commander"}
            </button>
          </>
        )}
      </div>
    </>
  );
}

function CardTile({
  card,
  bannedBy,
  selected,
  chosen,
  onClick,
}: {
  card: CardData;
  bannedBy?: string | null;
  selected?: boolean;
  chosen?: boolean;
  onClick: () => void;
}) {
  const className =
    "bandraft-tile" +
    (selected ? " selected" : "") +
    (bannedBy ? " banned" : "") +
    (chosen ? " chosen" : "");
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      title={bannedBy ? `${card.name} — banned by ${bannedBy}` : card.name}
      aria-pressed={selected ? true : undefined}
    >
      {card.image_small ? <img src={card.image_small} alt={card.name} /> : <div className="permtile-placeholder">{card.name}</div>}
      {bannedBy && <span className="bandraft-ban-stamp">Banned by {bannedBy}</span>}
      {chosen && <span className="bandraft-chosen-stamp">Commander</span>}
      <span className="bandraft-tile-name">{card.name}</span>
    </button>
  );
}

/** Final board: everyone's commander, side by side. */
function Results({ packs, myUserId }: { packs: BanDraftPack[]; myUserId: string }) {
  const openInspector = useInspector((s) => s.open);
  return (
    <>
      <div className="bandraft-prompt">
        <h3>The table is set</h3>
        <p>Every pack came home and every commander is locked in. Click one to read it in full.</p>
      </div>
      <div className="bandraft-cards">
        {packs.map((pack) => {
          const card = pack.cards.find((c) => c.id === pack.pickedCardId);
          if (!card) return null;
          return (
            <div key={pack.ownerUserId}>
              <CardTile card={card} chosen onClick={() => openInspector(card)} />
              <p className="hint" style={{ margin: "0.15rem 0 0", textAlign: "center" }}>
                {pack.ownerUserId === myUserId ? "You" : pack.ownerUsername}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * Where every pack is and what each player ended up with. Also the host's
 * invite control, which only exists before the deal — seats are frozen after.
 */
function TablePanel() {
  const meta = useBanDraft((s) => s.meta);
  const packs = useBanDraft((s) => s.packs);
  const myUserId = useBanDraft((s) => s.myUserId);
  const invitePlayers = useBanDraft((s) => s.invitePlayers);

  const [inviteValue, setInviteValue] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  if (!meta) return null;
  const isHost = meta.hostUserId === myUserId;

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
    <div className="bandraft-table-panel">
      <h3>The table ({meta.members.length})</h3>
      <ul className="bandraft-seats">
        {meta.members.map((member) => {
          const pack = packs.find((p) => p.ownerUserId === member.userId);
          const picked = pack?.pickedCardId ? pack.cards.find((c) => c.id === pack.pickedCardId) : null;
          return (
            <li key={member.userId} className={member.userId === myUserId ? "me" : undefined}>
              <span className="bandraft-seat-name">
                {member.username}
                {member.userId === meta.hostUserId && <span className="bandraft-seat-host" title="Host">★</span>}
              </span>
              <span className="bandraft-seat-state">
                {!pack
                  ? "no pack yet"
                  : picked
                    ? `chose after ${pack.bans.length} ${pack.bans.length === 1 ? "ban" : "bans"}`
                    : `${member.userId === myUserId ? "Your" : "Their"} pack is ${draft.describeWaiting(meta, pack, myUserId ?? "")}`}
              </span>
              {picked && <span className="bandraft-seat-commander">{picked.name}</span>}
            </li>
          );
        })}
      </ul>

      {isHost && !meta.started && (
        showInvite ? (
          <div className="bandraft-invite-form">
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
          <button className="btn bandraft-invite-btn" onClick={() => setShowInvite(true)}>+ Invite a player</button>
        )
      )}
    </div>
  );
}
