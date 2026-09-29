import { groupByQuadrant } from "../../lib/cardRules";
import PermanentTile from "./PermanentTile";
import type { GameAction, Permanent } from "../../lib/types";

interface Props {
  battlefield: Permanent[];
  playerId: string;
  interactive: boolean;
  mini?: boolean;
  dispatch?: (a: GameAction) => void;
}

const QUADRANT_META = [
  { key: "creatures" as const, cls: "q-creatures", label: "Creatures" },
  { key: "planeswalkers" as const, cls: "q-planeswalkers", label: "Planeswalkers" },
  { key: "lands" as const, cls: "q-lands", label: "Lands" },
  { key: "other" as const, cls: "q-other", label: "Artifacts & other" },
];

export default function Quadrants({ battlefield, playerId, interactive, mini, dispatch }: Props) {
  const grouped = groupByQuadrant(battlefield);
  return (
    <div className="quadrants">
      {QUADRANT_META.map(({ key, cls, label }) => {
        const stacks = grouped[key];
        return (
          <div key={key} className={"quadrant " + cls + (stacks.length === 0 ? " empty" : "")}>
            <div className="qlabel">{label}</div>
            <div className="qcards">
              {stacks.map((stack) => (
                <PermanentTile key={stack.key} stack={stack} playerId={playerId} interactive={interactive} mini={mini} dispatch={dispatch} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
