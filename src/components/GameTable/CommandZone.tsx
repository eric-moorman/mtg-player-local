import ZoneCardTile from "./ZoneCardTile";
import type { CardInstance, GameAction } from "../../lib/types";

interface Props {
  command: CardInstance[];
  playerId: string;
  interactive: boolean;
  mini?: boolean;
  dispatch?: (a: GameAction) => void;
  /** Times each commander has been cast from the command zone, for commander tax (+{2} each). */
  commanderCasts?: Record<string, number>;
}

export default function CommandZone({ command, playerId, interactive, mini, dispatch, commanderCasts }: Props) {
  return (
    <div className={"command-zone" + (command.length === 0 ? " empty" : "")}>
      <div className="qlabel">{command.length > 1 ? "Commanders" : "Commander"}</div>
      <div className="command-cards">
        {command.map((c) => {
          const casts = commanderCasts?.[c.name] ?? 0;
          return (
            <div className="command-card-wrap" key={c.iid}>
              <ZoneCardTile card={c} playerId={playerId} from="command" interactive={interactive} mini={mini} dispatch={dispatch} />
              {casts > 0 && (
                <span className="tax-badge" title={`Cast ${casts} time${casts > 1 ? "s" : ""} from the command zone — tax +${casts * 2} generic mana`}>
                  +{casts * 2}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
