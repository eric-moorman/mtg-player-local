# Kitchen Table — Design Document

*A peer-to-peer virtual table for playing Magic: the Gathering with friends. No server, no rules engine — just cards, zones, and the honor system.*

---

## 1. Overview & Goals

"Kitchen table Magic" is the community's own name for casual, unofficial play among friends — no judges, no tournament rules, everyone tracking their own board and trusting each other to get it right. This app is that experience, online:

- Any number of friends can start a game together with **no server to set up or maintain**.
- The app provides the *table*, not the *rules*: zones, tapping, counters, life totals, tokens. It never knows what "Lightning Bolt" does — a player reads the card and manually does the effect (moves cards, adjusts life, adds a counter), exactly like at a physical table.
- A **deck builder** backed by the full Scryfall card catalog (real card text and art) lets players build and store decks before they sit down to play.

## 2. Non-goals

- No rules/stack engine, no automatic triggers, no legality or format enforcement.
- No anti-cheat. This is a tool for trusted friends, not a matchmaking or ranked platform.
- No user accounts or central database — nothing is stored anywhere but each player's own browser.

## 3. Architecture

**Platform**: Web app (React + TypeScript + Vite), deployed as a static site (e.g. Netlify/Vercel/GitHub Pages). There is no backend to host — the only server involved isn't run by us at all (see Signaling, below).

**Peer-to-peer networking**: WebRTC DataChannels via **PeerJS**, which wraps the two pieces WebRTC needs:

- *Signaling* — before two browsers can talk directly, they need a one-time handshake to exchange connection info. True "serverless discovery" isn't possible on the open internet, so this handshake goes through a **free, public WebRTC broker** (PeerJS's public cloud service). It only ever sees the handshake, never game data, and we don't run or maintain it.
- *Transport* — once connected, all game traffic flows **directly between players' browsers**, encrypted by DTLS as a built-in property of WebRTC DataChannels. This is the actual "no central server" part: nobody's moves, hands, or chat ever pass through a third party.

**Room lifecycle**:
1. Host clicks **Create Game** → gets a short room code / shareable link.
2. Host sends the code to friends (Discord, text, whatever).
3. Each friend opens the link / enters the code → PeerJS broker exchanges handshake info → a direct, encrypted DataChannel opens between that friend and the host.

**Topology for N players — host-relay**: the player who created the game acts as the authoritative source of board state. Every action (a card moved, a counter changed) is sent to the host, applied, and the resulting state is broadcast back out to everyone. This keeps state-sync logic simple (one source of truth) at the cost of a small dependency on the host staying connected.

```
   P2 <---\
   P3 <----> HOST (P1) <----> P4
   P5 <---/
```

**Host migration (v1, basic)**: if the host disconnects, the game pauses with a "host left" notice. Any remaining player can click **Become Host** to re-key the room and resume from the last state their client cached locally. This is not seamless failover — it's a manual recovery step, acceptable for a casual tool.

**Known limitation**: some networks (strict corporate/school NATs) can block direct P2P connections even with a STUN server. A future version could add an optional TURN relay as a fallback — but TURN relays actual traffic through a third party, which is a real tradeoff against the "no central server" goal, so it's deliberately left out of v1 rather than added silently.

## 4. Data layer — Scryfall integration

- The full card catalog is pulled from Scryfall's **bulk data** endpoint (`oracle_cards`) once and cached client-side (IndexedDB), refreshed periodically in the background. This makes deck-builder search instant and avoids hammering the live API on every keystroke.
- Card art is always loaded live from Scryfall's own CDN (`image_uris`) — never re-hosted by us. Scryfall's API terms explicitly permit this kind of non-commercial fan use with attribution, so there are no licensing concerns for card content.
- All requests to Scryfall identify themselves with a descriptive `User-Agent`, per their API guidelines, and are rate-limited on our side.
- Attribution footer shown in-app: *"Card data and images © Wizards of the Coast, via Scryfall."*

## 5. Deck Builder

- Search/filter over the cached catalog by name, mana cost/color, and card type.
- Build a list, save/load any number of decks locally (IndexedDB).
- Import/export as a plain-text decklist (`4 Lightning Bolt` style) so players can move decks between browsers or share them in a chat.
- No legality checking — just a card count, if wanted. Consistent with the "no advanced logic" goal.

## 6. Game Table — the manual-play layer

Per player, the table provides:

- **Zones**: library, hand, battlefield, graveyard, exile, command zone.
- **Actions**: draw, mill, shuffle, drag a card between any zones, tap/untap, flip/reveal, generic counters (+1/+1, loyalty, etc.), a life-total tracker, dice roll / coin flip, and a blank/custom **token** (name + optional uploaded art).
- **Manual resolution**: there's no stack, no triggers — a shared table log/chat records what happened ("Alex casts Lightning Bolt targeting Grave Titan"), and players apply the actual effect themselves by moving cards and adjusting counters. This is the core design choice that keeps the app simple and card-set-agnostic forever — it never needs updating when new cards are printed.
- **Hidden zones**: hands and libraries are hidden from other players client-side. This is **trust-based, not cryptographically enforced** — since the host relays state, a technically malicious host could see routed traffic. That's an accepted, explicitly-documented limitation for a friends-only casual tool, not something v1 tries to solve.
- **Table customization**: a small set of default playmat/background images ships with the app, and players can **upload their own custom background image**. In v1, an uploaded background renders **locally only** (per viewer) rather than being synced to other players, to avoid pushing large binary blobs over the data channel. Syncing custom playmats to everyone at the table is a natural future enhancement, not a v1 requirement.

### Seeing the whole table

The battlefield is a *public* zone in Magic — everyone's permanents are visible to everyone at a physical table, so the app shows every player's battlefield to every other player (small thumbnails are fine; the layout is scrollable). Only hands and libraries stay hidden, per the rule above. Each opponent gets a compact strip showing their life total, their battlefield (same quadrant layout described below, just smaller), and a minimal hand/library/graveyard/exile count — never their actual hand contents.

### Battlefield layout: quadrants + stacking

Rather than one loose pile of permanents, each player's battlefield is split into four quadrants by card type, using the `type_line` already cached from Scryfall — no new card-specific logic required:

| | Left | Right |
|---|---|---|
| **Top** | Creatures | Planeswalkers |
| **Bottom** | Lands | Artifacts & everything else (enchantments, battles, etc.) |

A quadrant that has nothing in it simply isn't rendered, so a board with no planeswalkers doesn't waste space on an empty box.

Multiple permanents that are the same card **and** in the same state — same tap state, same counters — collapse into a single tile with a small count badge (e.g. nine Islands become one tile marked `×9`). The moment one copy differs (a tapped creature among untapped ones, a creature with a counter on it), it splits out into its own tile. This keeps a battlefield full of basic lands or tokens readable without hiding any state that actually matters.

### Card inspector

Clicking any *visible* card (yours, an opponent's battlefield permanent, or a card in the deck builder) opens a large preview over the board: the full-size Scryfall art, name, mana cost, type line, power/toughness or loyalty, and its printed **oracle text and keywords** — all pulled from the same cached Scryfall data used for deck building. This is purely reference display, not rules evaluation: the app shows the player what the card says so *they* can decide how to apply it, same as picking the card up off the table to read it. Cards in hidden zones (opponents' hands, anyone's library) are never inspectable, consistent with the hidden-zone rule above.

## 7. Security & privacy model

- WebRTC DataChannels are DTLS-encrypted by default — real transport security with no extra work.
- The room code is the shared secret: anyone who wants to see or join a specific game needs that code.
- No accounts, no server-side storage of any kind — there's nothing centralized to leak, because nothing is stored centrally.

## 8. Roadmap

| Phase | Scope |
|---|---|
| 1 | Direct 2-player P2P connection, basic board (zones, tap, counters, life), deck builder against cached Scryfall data |
| 2 | Host-relay extended to N players, room codes/links, reconnect handling |
| 3 | Table customization (playmats, custom tokens), host migration, polish |

## 9. Risks / open items

- **Storage**: the cached card catalog is a sizable IndexedDB payload; needs a "last updated" indicator and a manual refresh, and graceful behavior on storage-constrained devices.
- **NAT traversal**: some players may simply fail to connect directly without a TURN fallback (see §3). Flag this clearly in-app rather than failing silently.
- **Host migration UX**: acceptable for v1 but rough; revisit if host churn turns out to be common in practice.
- **Hidden-zone trust model**: acceptable for a friends-only tool; would need real cryptographic hiding (e.g., per-player encrypted zones) if this were ever opened to strangers.

---

*UI mockups for the screens referenced above are published separately as an interactive artifact.*
