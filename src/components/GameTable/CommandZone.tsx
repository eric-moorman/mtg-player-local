import ZoneCardTile from "./ZoneCardTile";
import type { CardInstance, GameAction } from "../../lib/types";

interface Props {
  command: CardInstance[];
  playerId: string;
  interactive: boolean;
  mini?: boolean;
  dispatch?: (a: GameAction) => void;
}

export default function CommandZone({ command, playerId, interactive, mini, dispatch }: Props) {
  return (
    <div className={"command-zone" + (command.length === 0 ? " empty" : "")}>
      <div className="qlabel">{command.length > 1 ? "Commanders" : "Commander"}</div>
      <div className="command-cards">
        {command.map((c) => (
          <ZoneCardTile key={c.iid} card={c} playerId={playerId} from="command" interactive={interactive} mini={mini} dispatch={dispatch} />
        ))}
      </div>
    </div>
  );
}
