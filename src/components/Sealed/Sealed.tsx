import { useSealed } from "../../store/useSealed";
import SealedSetup from "./SealedSetup";
import SealedPacks from "./SealedPacks";
import SealedBuy from "./SealedBuy";
import PoolBuilder from "./PoolBuilder";
import "./Sealed.css";

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function Sealed() {
  const phase = useSealed((s) => s.phase);
  const activeTab = useSealed((s) => s.activeTab);
  const setActiveTab = useSealed((s) => s.setActiveTab);
  const pool = useSealed((s) => s.pool);
  const budget = useSealed((s) => s.budget);
  const spent = useSealed((s) => s.spent);

  if (phase === "loading") {
    return (
      <section>
        <div className="screen-head"><h2>Sealed Pool</h2></div>
        <p className="hint">Loading card pools for your chosen sets…</p>
      </section>
    );
  }

  if (phase === "setup") return <SealedSetup />;

  const remaining = budget - spent;

  return (
    <section data-tour="sealed-main">
      <div className="screen-head">
        <h2>Sealed Pool</h2>
        <span className="sub">Spend your budget, then build a deck from whatever you end up with</span>
      </div>

      <div className="sealed-budget-bar">
        <span>Remaining: <b>{formatPrice(Math.max(0, remaining))}</b> of {formatPrice(budget)}</span>
        <span className="sealed-pool-count">{pool.length} cards in pool</span>
      </div>

      <div className="sealed-tabs">
        <button className={"sealed-tab" + (activeTab === "packs" ? " active" : "")} onClick={() => setActiveTab("packs")}>
          Open Packs
        </button>
        <button className={"sealed-tab" + (activeTab === "buy" ? " active" : "")} onClick={() => setActiveTab("buy")}>
          Buy Cards
        </button>
        <button className={"sealed-tab" + (activeTab === "build" ? " active" : "")} onClick={() => setActiveTab("build")} disabled={pool.length === 0}>
          Build Deck
        </button>
      </div>

      {activeTab === "packs" && <SealedPacks />}
      {activeTab === "buy" && <SealedBuy />}
      {activeTab === "build" && <PoolBuilder />}
    </section>
  );
}
