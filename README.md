# Kitchen Table

A peer-to-peer web app for playing Magic: the Gathering with friends. No server to run, no rules engine — see `DESIGN.md` for the full design doc and the published mockups for the original visual reference.

**Live: https://eric-moorman.github.io/mtg-player-local/** — deployed for free on GitHub Pages; every push to `main` auto-redeploys via `.github/workflows/deploy.yml`.

## Run it

```
npm install
npm run dev
```

Open the printed `localhost` URL. To actually test a game, open it in two browser windows (or send the URL to a friend) — one creates a game and shares the room code, the other joins with it.

`npm run build` produces a static `dist/` site — there's no backend to deploy, since the only third party involved is PeerJS's public broker, used solely for the initial connection handshake.

## What's implemented

- **Lobby** — create/join a room by code, pick a deck, ready up, host starts the game.
- **Deck Builder** — search Scryfall (live, or against a one-time cached full catalog), build and save decks, import/export as text lists.
- **Game Table** — per-player zones, a four-quadrant battlefield (creatures / planeswalkers / lands / artifacts & other) with identical-permanent stacking, tap/counters/move actions, tokens, life tracking, dice/coin, a synced table log and chat, and a full-card inspector with oracle text and keywords.
- **Settings** — display name/color, and a playmat background (bundled or your own upload) that's local to your own view only.

Networking is host-relay: the player who creates the room holds the authoritative game state and broadcasts it to everyone else, with each player's hand and library redacted to a count for everyone but themselves.
