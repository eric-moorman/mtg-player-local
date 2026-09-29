import { useState } from "react";
import { useGame, type Screen } from "../store/useGame";
import { IconChevron, IconDeck, IconFlag, IconLobby, IconSettings, IconTable } from "./icons";
import ReportModal from "./ReportModal";

const NAV: { id: Screen; label: string; icon: (props: { size?: number }) => JSX.Element }[] = [
  { id: "lobby", label: "Lobby", icon: IconLobby },
  { id: "deckbuilder", label: "Deck Builder", icon: IconDeck },
  { id: "table", label: "Game Table", icon: IconTable },
  { id: "settings", label: "Settings", icon: IconSettings },
];

const STORAGE_KEY = "kt-nav-collapsed";

export default function Sidebar() {
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);
  const matchActive = useGame((s) => s.gameState?.started ?? false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");
  const [reportOpen, setReportOpen] = useState(false);
  const items = NAV.filter((r) => r.id !== "table" || matchActive);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <nav className={"sidebar" + (collapsed ? " collapsed" : "")} aria-label="Screens">
      <button className="sidebar-toggle" onClick={toggle} title={collapsed ? "Expand navigation" : "Collapse navigation"} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
        <IconChevron direction={collapsed ? "right" : "left"} />
      </button>

      {items.map((r) => {
        const Icon = r.icon;
        return (
          <button
            key={r.id}
            className={"sidebar-btn" + (screen === r.id ? " active" : "")}
            onClick={() => setScreen(r.id)}
            title={collapsed ? r.label : undefined}
          >
            <span className="sidebar-icon"><Icon /></span>
            <span className="sidebar-label">{r.label}</span>
          </button>
        );
      })}

      <button className="sidebar-btn sidebar-report" onClick={() => setReportOpen(true)} title={collapsed ? "Report a bug / request a feature" : undefined}>
        <span className="sidebar-icon"><IconFlag /></span>
        <span className="sidebar-label">Feedback</span>
      </button>

      {reportOpen && <ReportModal onClose={() => setReportOpen(false)} />}
    </nav>
  );
}
