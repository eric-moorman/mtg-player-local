import type { Screen } from "../store/useGame";

export interface TourStep {
  /** Screen to switch to for this step; omit to keep whatever screen the previous step left. */
  screen?: Screen;
  /** CSS selector for the element to spotlight. Omit for a plain centered step (no live target). */
  selector?: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Kitchen Table",
    body: "A quick walkthrough of the app — five screens, about a minute. Use Next and Back anytime, or Skip to close.",
  },
  {
    screen: "lobby",
    selector: '[data-tour="lobby-create"]',
    title: "Host a game",
    body: "Start a table and you'll get a room code to share with friends. You're the host for any game you create.",
  },
  {
    screen: "lobby",
    selector: '[data-tour="lobby-join"]',
    title: "Join a friend's game",
    body: "Paste in a code someone sent you to connect directly to their table. No accounts needed — connections are made browser-to-browser.",
  },
  {
    screen: "deckbuilder",
    selector: '[data-tour="db-search"]',
    title: "Find cards",
    body: "Search by name and filter by color, type, mana value, price, or keyword. Load the full catalog once for instant offline search instead of hitting Scryfall live.",
  },
  {
    screen: "deckbuilder",
    selector: '[data-tour="db-results"]',
    title: "Add cards to your deck",
    body: "Click the + on any result to add a copy. Click a card's art to inspect it full-size.",
  },
  {
    screen: "deckbuilder",
    selector: '[data-tour="db-decklist"]',
    title: "Your decklist",
    body: "Click a card's crown to set it as your commander, then save the deck. You can also import or export a plain-text decklist.",
  },
  {
    screen: "sealed",
    selector: '[data-tour="sealed-main"]',
    title: "Sealed Pool",
    body: "Set a budget and pick which sets are in play, then open packs or buy singles directly. Once you've got a pool, build the best deck you can from whatever you end up with.",
  },
  {
    screen: "table",
    title: "Game Table",
    body: "Once a game starts, this is your table — life totals, your hand, the battlefield, and your library, graveyard, and exile all live here, along with a table log. Right-click, or use a card's ⋮ button, for more actions like tapping, adding counters, or moving it between zones.",
  },
  {
    screen: "settings",
    selector: '[data-tour="settings-account"]',
    title: "Optional account",
    body: "Sign in to sync your decks, identity, playmat, and sealed-pool settings across devices. Everything works fine without one too — it's purely opt-in.",
  },
  {
    screen: "settings",
    selector: '[data-tour="settings-playmat"]',
    title: "Table background",
    body: "Pick a playmat, or upload your own image. It's personal to your device — other players still see the same cards and board state, just against their own choice of background.",
  },
  {
    screen: "settings",
    selector: '[data-tour="settings-identity"]',
    title: "Your name and color",
    body: "This is how you show up to other players at the table.",
  },
  {
    screen: "lobby",
    selector: '[data-tour="nav-tour-button"]',
    title: "That's the tour",
    body: "You can restart this walkthrough anytime from here. Have fun at the table!",
  },
];
