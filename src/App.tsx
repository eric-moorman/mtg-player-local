import { useEffect } from "react";
import { useGame } from "./store/useGame";
import { useAuth } from "./store/useAuth";
import { refreshAllFromAuthState } from "./lib/accountSync";
import Lobby from "./components/Lobby";
import DeckBuilder from "./components/DeckBuilder";
import Sealed from "./components/Sealed/Sealed";
import GameTable from "./components/GameTable/GameTable";
import Settings from "./components/Settings";
import Inspector from "./components/Inspector";
import Sidebar from "./components/Sidebar";
import TourOverlay from "./components/Tour/TourOverlay";

export default function App() {
  const screen = useGame((s) => s.screen);
  const loadCatalogFromCache = useGame((s) => s.loadCatalogFromCache);
  const checkSession = useAuth((s) => s.checkSession);

  useEffect(() => {
    // Catalog is shared reference data (not per-account), so it loads regardless of sign-in state.
    loadCatalogFromCache();
    // Decks/identity/playmat/sealed-config all branch on auth state internally — resolve the
    // session first so that first hydration reads the right place (cloud vs local IndexedDB).
    checkSession().then(refreshAllFromAuthState);
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
      <TourOverlay />
    </div>
  );
}
