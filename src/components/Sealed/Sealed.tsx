import { useSealed } from "../../store/useSealed";
import SealedGameList from "./SealedGameList";
import SealedSetup from "./SealedSetup";
import SealedPacks from "./SealedPacks";
import SealedBuy from "./SealedBuy";
import PoolBuilder from "./PoolBuilder";
import PoolGameRoster from "./PoolGameRoster";
import "./Sealed.css";

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

const SAVE_LABELS: Record<string, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn't save — check your connection",
};

export default function Sealed() {
  const view = useSealed((s) => s.view);
  const activeTab = useSealed((s) => s.activeTab);
  const setActiveTab = useSealed((s) => s.setActiveTab);
  const game = useSealed((s) => s.game);
  const rules = useSealed((s) => s.rules);
  const pool = useSealed((s) => s.pool);
  const spent = useSealed((s) => s.spent);
  const finished = useSealed((s) => s.finished);
  const saveState = useSealed((s) => s.saveState);
  const closeGame = useSealed((s) => s.closeGame);

  if (view === "list") return <SealedGameList />;
  if (view === "setup") return <SealedSetup />;

  if (view === "loading") {
    return (
      <section>
        <div className="screen-head"><h2>Sealed Pool</h2></div>
        <p className="hint">Loading card pools for this game's sets…</p>
      </section>
    );
  }

  if (!game || !rules) return <SealedGameList />;

  const remaining = rules.budget - spent;

  return (
    <section data-tour="sealed-main">
      <div className="screen-head poolgame-head">
        <div>
          <h2>{game.name}</h2>
          <span className="sub">
            {finished
              ? "This game is complete — your deck is saved and ready to play"
              : "Spend your budget, then build a deck from whatever you end up with"}
          </span>
        </div>
        <div className="poolgame-head-actions">
          {saveState !== "idle" && (
            <span className={"poolgame-save-state " + saveState}>{SAVE_LABELS[saveState]}</span>
          )}
          <button className="btn" onClick={closeGame}>← All pool games</button>
        </div>
      </div>

      <div className="sealed-budget-bar">
        <span>Remaining: <b>{formatPrice(Math.max(0, remaining))}</b> of {formatPrice(rules.budget)}</span>
        <span className="sealed-pool-count">{pool.length} cards in pool</span>
      </div>

      <div className="sealed-tabs">
        {/* A finished game is a historical record: the pool can still be browsed, but not added to. */}
        <button
          className={"sealed-tab" + (activeTab === "packs" ? " active" : "")}
          onClick={() => setActiveTab("packs")}
          disabled={finished}
          title={finished ? "This game is complete" : undefined}
        >
          Open Packs
        </button>
        <button
          className={"sealed-tab" + (activeTab === "buy" ? " active" : "")}
          onClick={() => setActiveTab("buy")}
          disabled={finished}
          title={finished ? "This game is complete" : undefined}
        >
          Buy Cards
        </button>
        <button className={"sealed-tab" + (activeTab === "build" ? " active" : "")} onClick={() => setActiveTab("build")}>
          Build Deck
        </button>
      </div>

      {activeTab === "packs" && <SealedPacks />}
      {activeTab === "buy" && <SealedBuy />}
      {activeTab === "build" && <PoolBuilder />}

      {/* Always shown, even solo: it's where the host's "invite a player" control lives. */}
      <PoolGameRoster />
    </section>
  );
}
