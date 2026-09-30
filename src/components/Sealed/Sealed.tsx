import { useSealed } from "../../store/useSealed";
import SealedSetup from "./SealedSetup";
import SealedSession from "./SealedSession";
import PoolBuilder from "./PoolBuilder";
import "./Sealed.css";

export default function Sealed() {
  const phase = useSealed((s) => s.phase);
  const activeTab = useSealed((s) => s.activeTab);
  const setActiveTab = useSealed((s) => s.setActiveTab);
  const pool = useSealed((s) => s.pool);

  if (phase === "loading") {
    return (
      <section>
        <div className="screen-head"><h2>Sealed Pool</h2></div>
        <p className="hint">Loading card pools for your chosen sets…</p>
      </section>
    );
  }

  if (phase === "setup") return <SealedSetup />;

  return (
    <section>
      <div className="screen-head">
        <h2>Sealed Pool</h2>
        <span className="sub">{activeTab === "acquire" ? "Spend your budget, then build a deck from whatever you end up with" : "Choose what actually goes in the deck from your pool"}</span>
      </div>
      <div className="sealed-tabs">
        <button className={"sealed-tab" + (activeTab === "acquire" ? " active" : "")} onClick={() => setActiveTab("acquire")}>
          Open Packs / Buy
        </button>
        <button className={"sealed-tab" + (activeTab === "build" ? " active" : "")} onClick={() => setActiveTab("build")} disabled={pool.length === 0}>
          Build Deck
        </button>
      </div>
      {activeTab === "acquire" ? <SealedSession /> : <PoolBuilder />}
    </section>
  );
}
