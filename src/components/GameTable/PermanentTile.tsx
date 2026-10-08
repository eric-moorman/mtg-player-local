import { useRef, useState } from "react";
import type { PermanentStack } from "../../lib/cardRules";
import { primaryCounterBadge, getQuadrant } from "../../lib/cardRules";
import { useInspector } from "../../store/useInspector";
import { startPointerDrag, consumeSuppressedClick } from "../../lib/pointerDrag";
import { useCloseOnOutside } from "../../lib/useCloseOnOutside";
import type { GameAction, ZoneName } from "../../lib/types";

export interface CombatContext {
  /** Who/what this player's creatures can attack: opponents, and enemy planeswalkers (id `pw:<iid>`). */
  attackTargets: { id: string; label: string }[];
  /** Every permanent currently attacking, table-wide, as block options. */
  activeAttackers: { iid: string; label: string; ownerId: string }[];
  /** Blocker iid+name, keyed by attacker iid — for the damage-assignment-order picker. */
  blockersFor: Record<string, { iid: string; name: string }[]>;
}

interface Props {
  stack: PermanentStack;
  playerId: string;
  mini?: boolean;
  interactive: boolean;
  dispatch?: (a: GameAction) => void;
  combat?: CombatContext;
}

const MOVE_TARGETS: { zone: ZoneName; label: string }[] = [
  { zone: "hand", label: "Hand" },
  { zone: "library", label: "Library (bottom)" },
  { zone: "graveyard", label: "Graveyard" },
  { zone: "exile", label: "Exile" },
  { zone: "command", label: "Command" },
];

export default function PermanentTile({ stack, playerId, mini, interactive, dispatch, combat }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const openInspector = useInspector((s) => s.open);
  const { representative, instances } = stack;
  const targetIid = instances[0].iid;
  const isPlaneswalker = getQuadrant(representative.type_line) === "planeswalkers";
  const isCreature = getQuadrant(representative.type_line) === "creatures";
  const badge = primaryCounterBadge(representative.counters);
  const blockers = combat?.blockersFor[targetIid] ?? [];
  const blockOrder = representative.blockOrder?.length ? representative.blockOrder : blockers.map((b) => b.iid);

  function act(action: GameAction) {
    dispatch?.(action);
    setMenuOpen(false);
  }

  function moveBlockOrder(from: number, to: number) {
    if (to < 0 || to >= blockOrder.length) return;
    const next = [...blockOrder];
    [next[from], next[to]] = [next[to], next[from]];
    dispatch?.({ k: "setBlockOrder", playerId, attackerIid: targetIid, order: next });
  }

  const draggable = interactive && !!dispatch;

  useCloseOnOutside(menuOpen, menuRef, () => setMenuOpen(false));

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(true);
  }

  return (
    <div
      className={"permtile" + (mini ? " mini" : "") + (representative.tapped ? " tapped" : "") + (menuOpen ? " menu-open" : "")}
      onContextMenu={draggable ? openMenu : undefined}
    >
      <div
        className="tile-art"
        onClick={() => { if (consumeSuppressedClick()) return; openInspector(representative); }}
        onMouseDown={
          draggable
            ? (e) =>
                startPointerDrag(
                  e,
                  (zone) => { if (zone !== "battlefield") dispatch!({ k: "moveCard", playerId, iid: targetIid, from: "battlefield", to: zone as ZoneName }); },
                  () => setMenuOpen(true),
                  representative.image_small
                )
            : undefined
        }
      >
        {representative.image_small ? (
          <img src={representative.image_small} alt={representative.name} draggable={false} />
        ) : (
          <div className="permtile-placeholder">{representative.name.slice(0, 1).toUpperCase()}</div>
        )}
      </div>
      {instances.length > 1 && <span className="stackbadge">×{instances.length}</span>}
      {badge && <span className="counterbadge">{badge}</span>}
      {representative.attacking ? (
        <span className="combatbadge attacking" title="Attacking">⚔</span>
      ) : representative.blocking ? (
        <span className="combatbadge blocking" title="Blocking">🛡</span>
      ) : null}

      {interactive && dispatch && (
        <button
          className="menubtn"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          aria-label={`Actions for ${representative.name} (or right-click or press-and-hold the card)`}
          title="Actions (or right-click or press-and-hold the card)"
        >
          ⋮
        </button>
      )}

      {menuOpen && (
        <div className="ctx-menu" ref={menuRef} onClick={(e) => e.stopPropagation()}>
          <div className="hd">{representative.name}</div>
          <button onClick={() => act({ k: "tap", playerId, iid: targetIid })}>
            {representative.tapped ? "Untap" : "Tap"}
          </button>
          <div className="counter-row">
            <span>+1/+1</span>
            <button onClick={() => act({ k: "addCounter", playerId, iid: targetIid, label: "+1/+1", delta: -1 })}>–</button>
            <button onClick={() => act({ k: "addCounter", playerId, iid: targetIid, label: "+1/+1", delta: 1 })}>+</button>
          </div>
          {isPlaneswalker && (
            <div className="counter-row">
              <span>Loyalty</span>
              <button onClick={() => act({ k: "addCounter", playerId, iid: targetIid, label: "loyalty", delta: -1 })}>–</button>
              <button onClick={() => act({ k: "addCounter", playerId, iid: targetIid, label: "loyalty", delta: 1 })}>+</button>
            </div>
          )}

          {isCreature && combat && (
            <>
              {representative.attacking ? (
                <button onClick={() => act({ k: "declareAttacker", playerId, iid: targetIid, target: null })}>Stop attacking</button>
              ) : (
                combat.attackTargets.length > 0 && (
                  <>
                    <div className="hd2">Attack</div>
                    {combat.attackTargets.map((t) => (
                      <button key={t.id} onClick={() => act({ k: "declareAttacker", playerId, iid: targetIid, target: t.id })}>{t.label}</button>
                    ))}
                  </>
                )
              )}
              {representative.blocking ? (
                <button onClick={() => act({ k: "declareBlocker", playerId, iid: targetIid, attackerIid: null })}>Stop blocking</button>
              ) : (
                !representative.attacking &&
                combat.activeAttackers.filter((a) => a.ownerId !== playerId).length > 0 && (
                  <>
                    <div className="hd2">Block</div>
                    {combat.activeAttackers
                      .filter((a) => a.ownerId !== playerId)
                      .map((a) => (
                        <button key={a.iid} onClick={() => act({ k: "declareBlocker", playerId, iid: targetIid, attackerIid: a.iid })}>{a.label}</button>
                      ))}
                  </>
                )
              )}
            </>
          )}

          {representative.attacking && blockers.length >= 2 && (
            <div className="block-order">
              <div className="hd2">Damage order</div>
              {blockOrder.map((iid, i) => {
                const b = blockers.find((x) => x.iid === iid);
                if (!b) return null;
                return (
                  <div className="block-order-row" key={iid}>
                    <span>{i + 1}. {b.name}</span>
                    <button onClick={() => moveBlockOrder(i, i - 1)} disabled={i === 0} aria-label={`Move ${b.name} earlier`}>↑</button>
                    <button onClick={() => moveBlockOrder(i, i + 1)} disabled={i === blockOrder.length - 1} aria-label={`Move ${b.name} later`}>↓</button>
                  </div>
                );
              })}
            </div>
          )}

          {MOVE_TARGETS.map((m) => (
            <button key={m.zone} onClick={() => act({ k: "moveCard", playerId, iid: targetIid, from: "battlefield", to: m.zone })}>
              Move to {m.label}
            </button>
          ))}
          <button onClick={() => act({ k: "reveal", playerId, iid: targetIid, from: "battlefield" })}>Reveal to all</button>
        </div>
      )}
    </div>
  );
}
