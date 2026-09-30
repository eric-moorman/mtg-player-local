import { useSealed } from "../../store/useSealed";
import SealedSetup from "./SealedSetup";
import SealedSession from "./SealedSession";
import PoolBuilder from "./PoolBuilder";
import "./Sealed.css";

export default function Sealed() {
  const phase = useSealed((s) => s.phase);

  if (phase === "loading") {
    return (
      <section>
        <div className="screen-head"><h2>Sealed Pool</h2></div>
        <p className="hint">Loading card pools for your chosen sets…</p>
      </section>
    );
  }
  if (phase === "session") return <SealedSession />;
  if (phase === "building") return <PoolBuilder />;
  return <SealedSetup />;
}
