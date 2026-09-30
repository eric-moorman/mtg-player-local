import { useEffect } from "react";
import { useGame } from "./store/useGame";
import * as db from "./lib/db";
import Lobby from "./components/Lobby";
import DeckBuilder from "./components/DeckBuilder";
import Sealed from "./components/Sealed/Sealed";
import GameTable from "./components/GameTable/GameTable";
import Settings from "./components/Settings";
import Inspector from "./components/Inspector";
import Sidebar from "./components/Sidebar";

export default function App() {
  const screen = useGame((s) => s.screen);
  const setIdentity = useGame((s) => s.setIdentity);
  const refreshDecks = useGame((s) => s.refreshDecks);
  const loadCatalogFromCache = useGame((s) => s.loadCatalogFromCache);
  const loadPlaymats = useGame((s) => s.loadPlaymats);

  useEffect(() => {
    db.getIdentity().then(setIdentity);
    refreshDecks();
    loadCatalogFromCache();
    loadPlaymats();
  }, []);

  return (
    <div className="page">
      <header className="topbar">
        <div className="wordmark">
          <span className="mark">🎴</span>
          <h1>Kitchen Table</h1>
        </div>
        <span className="status-tag">v0.1</span>
      </header>

      <div className="layout">
        <Sidebar />

        <div className="stage">
          <div className="frame">
            {screen === "lobby" && <Lobby />}
            {screen === "deckbuilder" && <DeckBuilder />}
            {screen === "sealed" && <Sealed />}
            {screen === "table" && <GameTable />}
            {screen === "settings" && <Settings />}
          </div>
          <p className="attribution">Card data and images © Wizards of the Coast, via Scryfall.</p>
        </div>
      </div>

      <Inspector />
    </div>
  );
}
