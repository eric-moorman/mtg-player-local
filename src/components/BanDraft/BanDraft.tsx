import { useBanDraft } from "../../store/useBanDraft";
import BanDraftList from "./BanDraftList";
import BanDraftSetup from "./BanDraftSetup";
import BanDraftTable from "./BanDraftTable";
import "./BanDraft.css";

export default function BanDraft() {
  const view = useBanDraft((s) => s.view);

  if (view === "setup") return <BanDraftSetup />;
  if (view === "active") return <BanDraftTable />;
  if (view === "loading") {
    return (
      <section>
        <div className="screen-head"><h2>Commander Draft</h2></div>
        <p className="hint">Opening your draft…</p>
      </section>
    );
  }
  return <BanDraftList />;
}
