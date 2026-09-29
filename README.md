# Kitchen Table

A peer-to-peer web app for playing Magic: the Gathering with friends. No server to run, no rules engine — see `DESIGN.md` for the full design doc and the published mockups for the original visual reference.

**Live: https://mtg-player-local.etmoorman15.workers.dev/** — deployed for free on Cloudflare Workers (static assets); every push to `main` auto-redeploys.

## Run it

```
npm install
npm run dev
```

Open the printed `localhost` URL. To actually test a game, open it in two browser windows (or send the URL to a friend) — one creates a game and shares the room code, the other joins with it.

`npm run build` produces the static `dist/` site. The one piece of server-side code is `worker/index.ts`, which backs the in-app "Report a bug / request a feature" form (`POST /api/report`) — it commits reports into `reports/`, and `.github/workflows/report-to-issue.yml` turns each one into a labeled GitHub Issue. See `.github/AGENT_INSTRUCTIONS.md` for the convention used to resolve an issue into a PR (on `agent-ready`-labeled issues only, never auto-merged).

## What's implemented

- **Lobby** — create/join a room by code, pick a deck, ready up, host starts the game.
- **Deck Builder** — search Scryfall (live, or against a one-time cached full catalog), build and save decks, import/export as text lists.
- **Game Table** — per-player zones, a four-quadrant battlefield (creatures / planeswalkers / lands / artifacts & other) with identical-permanent stacking, tap/counters/move actions, tokens, life tracking, dice/coin, a synced table log and chat, and a full-card inspector with oracle text and keywords.
- **Settings** — display name/color, and a playmat background (bundled or your own upload) that's local to your own view only.

Networking is host-relay: the player who creates the room holds the authoritative game state and broadcasts it to everyone else, with each player's hand and library redacted to a count for everyone but themselves.
