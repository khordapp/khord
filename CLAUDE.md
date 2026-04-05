# Khord

Decentralized social platform for sharing music across streaming services. Users share songs via AT Protocol; listeners hear tracks on whichever platform they use (Spotify, Apple Music, YouTube Music, etc.). Artist/platform revenue flows naturally since playback is native on each platform.

## Dev setup

```bash
npm install
npm run dev        # http://localhost:5173
npm run tunnel     # named cloudflared tunnel (dev.khord.app) + dev server
npm run check      # type-check
npm run build
```

Copy `.env.example` to `.env` and fill in values before running. `PUBLIC_APP_URL` is hardcoded to `https://dev.khord.app` in `.env` — the tunnel script uses this stable URL automatically.

## Stack

- **SvelteKit** + TypeScript + TailwindCSS
- **AT Protocol** (`@atproto/api`) — user identity, record storage
- **Odesli API** (song.link) — cross-platform URL resolution (free, no key required)
- **Spotify Web API** — client credentials search to fill the Spotify gap Odesli leaves
- **iTunes Search API** — free text search for song discovery (no auth)

## Project structure

```
src/
  lib/
    atproto/
      agent.ts              # OAuth client, signIn (redirect flow), session helpers
      lexicons/
        song.ts             # app.khord.song types
        vote.ts             # app.khord.vote types
        setlist.ts          # app.khord.setlist types + KhordSetlistItemSnapshot
        proposal.ts         # app.khord.setlist.proposal types + KhordProposal
      social.ts             # fetchSongs, fetchSetlists, fetchSetlist, createSetlist, updateSetlist, deleteSetlist, createProposal, fetchProposalsFromPDSes
    odesli/
      client.ts             # resolveUrl(), extractPlatformUrls() (includes songlinkUrl, thumbnailUrl)
    server/
      spotify.ts            # client credentials token + track search (server-only)
      db.ts                 # getDb() read-only / getDbRw() read-write SQLite connections (null if no DB)
      access.ts             # checkAndRegister(did) — ALLOWED_DIDS + MAX_USERS enforcement
    itunes/
      client.ts             # free text search for song discovery
    theme/
      types.ts              # Theme interface (33 tokens)
      dark.ts               # default: zinc-950 base, white CTA, violet accent
      light.ts              # gray-100 base, gray-900 CTA, violet/indigo accent
      slate.ts / gray.ts / neutral.ts / stone.ts          # neutral dark variants
      slate-light.ts / zinc-light.ts / neutral-light.ts / stone-light.ts  # neutral light variants
      navy.ts / teal.ts / emerald.ts / rose.ts / violet.ts  # chromatic dark variants
      index.ts              # reads PUBLIC_THEME, exports resolved `theme` object
    components/
      ShareSongModal.svelte # search → Odesli resolve → AT Protocol record create; note field (300 char limit)
      SongCard.svelte       # feed card: platform links, selection, upnote, post-to-feed, resync metadata
      SongSearch.svelte     # iTunes-backed search input
      StreamingPill.svelte  # branded pill + chevron dropdown; preferred platform first; shared by feed + setlists
      ServicePicker.svelte  # preferred platform picker used in /settings
    stores/
      auth.ts               # session store, isLoggedIn derived, authReady (gates post-OAuth loads)
      votes.ts              # user's upvotes, like/unlike actions
      shareSong.ts          # modal open state + lastSharedSong for feed update
      createSetlist.ts      # modal open state
      following.ts          # followed users (FollowedUser[])
      prefs.ts              # localStorage-backed user preferences (preferred platform)
      instance.ts           # instanceConfig store (albumArtDisabled) populated from /api/auth/status
  routes/
    +layout.svelte          # shell, avatar dropdown nav, speed-dial FAB (share song / new setlist), footer
    +page.svelte            # home — Feed / Daily / Setlists tabs; selection, bulk delete, create setlist
    login/+page.svelte      # AT Protocol login form; shows instance full/restricted state
    oauth/callback/         # AT Protocol OAuth callback; calls /api/auth/check, signs out if denied
    spotify/callback/       # Spotify OAuth callback (user-level auth, if enabled)
    invite/                 # invite page
    settings/               # preferred streaming service picker
    s/[handle]/[rkey]/        # setlist detail: drag reorder, add songs, propose songs, review proposals, share
    setlists/[handle]/[rkey]/ # 301 redirect → /s/[handle]/[rkey]/
    api/resolve/            # server-side Odesli proxy + Spotify augmentation
    api/auth/status/        # GET — returns { restricted, full, albumArtDisabled }
    api/auth/check/         # POST { did } — access control check + register user
    api/feed/               # GET — SQLite AppView feed (returns 503 if DB unavailable)
    api/votes/              # GET — SQLite AppView votes for a DID (returns 503 if DB unavailable)
    api/votes/counts/       # GET ?uris=... — batch vote counts for a list of song URIs
    api/proposals/          # GET ?setlistUri=... — proposals for a setlist (returns 503 if DB unavailable)
    api/thumbnail/          # GET ?url= — server-side image proxy for album art (avoids CORS on third-party CDNs)
lexicons/
  app.khord.song.json       # AT Protocol lexicon definitions
  app.khord.vote.json
  app.khord.setlist.json    # setlist lexicon — ordered items[], snapshot per item, collaborators[], open flag
  app.khord.setlist.proposal.json  # proposal lexicon — setlistUri, setlistCid, snapshot, note
indexer/
  index.js                  # AT Protocol firehose subscriber — writes songs/votes/proposals to SQLite
  schema.sql                # SQLite schema — actors, songs, votes, proposals, cursor, registered_users
  Dockerfile                # includes python3/make/g++ for better-sqlite3 native bindings
```

## AT Protocol lexicons

Records are stored in the user's PDS under these NSIDs:

| NSID | Purpose |
|---|---|
| `app.khord.song` | Shared song — stores Odesli-resolved platform URLs |
| `app.khord.vote` | Up/down vote on a song |
| `app.khord.setlist` | Ordered list of song references; stored on creator's PDS |
| `app.khord.setlist.proposal` | Song proposal from a non-owner; stored on proposer's PDS; includes embedded snapshot + optional note |

### app.khord.setlist

- `title` (required), `description` (optional), `createdAt`
- `items[]` — ordered; each item: `songUri`, `songCid`, `addedBy` (DID), `addedAt`, `snapshot` (optional)
- `snapshot` — embedded copy of song metadata at time of addition (title, artist, album, all platform URLs); used as fallback if source record is deleted; optional for backward compatibility
- `collaborators[]` — DIDs; listed but contribution writes are creator-only in v1
- `open` — boolean; future flag for open contribution (v2)
- Stored on creator's PDS; `updateSetlist` does a full `putRecord` to persist reorders/edits

## Theming

Themes are selected via `PUBLIC_THEME` in `.env`. A rebuild (or dev server restart) is required when changing the value — `$env/static/public` is used so server and client always agree.

| Category | Values |
|---|---|
| Neutral dark | `dark` (default), `zinc`, `slate`, `gray`, `neutral`, `stone` |
| Neutral light | `light`, `zinc-light`, `slate-light`, `neutral-light`, `stone-light` |
| Chromatic dark | `navy`, `teal`, `emerald`, `rose`, `violet` |

The `Theme` interface has 33 typed string tokens covering backgrounds, borders, text, interactive states, primary CTA, accent, and link colors. All values are complete Tailwind class strings so JIT scanning works without safelisting.

To add a new theme: create `src/lib/theme/mytheme.ts` implementing `Theme`, then register it in `src/lib/theme/index.ts`.

## Song sharing flow

1. User searches by text (iTunes API) → selects a result
2. Apple Music URL passed to `/api/resolve` (server-side proxy):
   - Calls Odesli → returns Deezer, Tidal, Amazon Music, Apple Music, SoundCloud, song.link page URL
   - Odesli does not return Spotify or YouTube Music — Spotify separately searched via client credentials; YouTube Music skipped (API quota too limiting)
3. `app.khord.song` record created in PDS with platform URLs for: Spotify, Apple Music, Deezer, Tidal, Amazon Music, SoundCloud, plus `songlinkUrl` for attribution
4. Feed updates immediately (optimistic prepend via `lastSharedSong` store)

## SongCard behaviour (feed)

- Album art: 48×48 thumbnail top-left (from `record.thumbnailUrl`); hidden if `albumArtDisabled` instance config is set or URL absent
- Selected state: check icon overlays thumbnail (or plain circle if no art); clicking upper card area toggles selection
- Preferred platform (set in `/settings`, stored in localStorage) shown first as a branded pill (bg/text/border inline styles) via `StreamingPill`; remaining platforms behind a chevron dropdown; song.link shown separately in link color
- Action row (bottom-right): Resync (owner-only, icon expands on hover) → Post to AT Protocol feed → Upnote
- Resync: re-resolves `appleMusicUrl` via `/api/resolve`, does a `putRecord` to update the PDS record in place; updates card reactively
- No per-card delete button — deletion is handled from the feed header
- Note (optional, ≤300 chars) shown below metadata with dynamic left padding matching art/no-art alignment

## Setlist detail page (`/s/[handle]/[rkey]`)

- Canonical URL is `/s/[handle]/[rkey]`; old `/setlists/[handle]/[rkey]` path returns 301
- Resolves handle → DID via `getProfile`, then fetches setlist record + all song records in parallel
- If a song record is missing (deleted), falls back to the embedded `snapshot` in the setlist item — renders identically
- Drag-to-reorder via `svelte-dnd-action`; on drop, calls `updateSetlist` with reordered items array
- Per-row streaming pill: preferred platform first (branded), chevron expands dropdown; song.link shown separately
- Owner can: edit title inline, remove individual songs, delete the entire setlist (with confirm modal)
- Owner "Add song" panel: search → Odesli resolve → creates PDS record → appends to setlist; "Also share to feed" checkbox (default unchecked) controls `listed` field on the created song record
- Share button opens a compose sheet pre-filled with setlist title + URL; URL gets a link facet; editable before posting
- Non-owners see the setlist read-only (no drag, no remove, no edit)
- Vote counts fetched from `/api/votes/counts` and displayed per row
- **Proposals (owner):** loaded from `/api/proposals?setlistUri=...` after setlist loads; 503 fallback queries each follower's PDS + owner's own DID. Accept creates `app.khord.song` on owner's PDS and appends item to setlist. Dismiss removes from in-memory list and persists URI to `localStorage` (`khord_dismissed_proposals_<rkey>`) so dismissed proposals don't reappear on reload.
- **Propose a song (non-owner):** "Propose a song" button visible to logged-in non-owners. Panel: iTunes search → Odesli resolve → `createRecord` for `app.khord.setlist.proposal` on proposer's PDS with embedded song snapshot. Submitted state shown for 2s then panel closes.
- Dev-only "Seed test proposal" button at bottom of page (visible only in `import.meta.env.DEV` + owner) creates a Bohemian Rhapsody test proposal from current session

## Post-to-feed (cross-post to AT Protocol social)

- "Post" button on each card opens a compose sheet (only when logged in and `songlinkUrl` present)
- Compose sheet has three sections:
  - **Fixed header** (not editable): "Title by Artist" — always included; carries a link facet pointing to `songlinkUrl`
  - **Editable note** (optional): pre-filled from `record.note` if present, otherwise blank; user's personal comment
  - **Fixed footer** (not editable): "Shared from {APP_NAME}" — always appended
- Char counter (300 limit) counts all three sections combined; amber ≤20, red over limit
- Optional album art toggle (default on if art available and not globally disabled): fetches thumbnail via `/api/thumbnail` proxy, uploads as blob, attaches as `app.bsky.embed.external` pointing to `songlinkUrl`
- Posts `app.bsky.feed.post` to user's PDS; "Posted" confirmation shown for 3s after success

## Home page tabs

Three tabs rendered in `+page.svelte`, controlled by `activeTab: 'feed' | 'daily' | 'setlists'`:

**Feed** — sticky toolbar with:
- Refresh (reloads + scrolls to top)
- "Setlist (N)" button (accent color, appears when songs selected) → create setlist modal
- "Remove N" button (red, appears when songs selected) → confirmation modal before deletion
- Song cards are selectable; `selectedUris: Set<string>` tracked in `+page.svelte`

**Daily** — date-filtered view of feed items; date picker in toolbar; defaults to today
- Songs are selectable; `dailySelectedUris` is a separate set, reset when date changes
- "Setlist all" button always visible when songs exist; pre-fills modal with all items for the day
- "Setlist (N)" replaces it once specific cards are selected

**Setlists** — lists user's own setlists (lazy-loaded on first tab switch); each row links to `/s/[handle]/[rkey]`

## Setlist snapshot resilience

When a song is added to a setlist (via CreateSetlistModal, feed selection, or daily selection), a `snapshot` of the song's display data is embedded in the setlist item:
- title, artist, album, thumbnailUrl, all platform URLs
- The setlist detail page fetches the live PDS record first; if unavailable, reconstructs a `KhordSongRecord` from the snapshot
- `snapshot` is optional — existing setlist records without it continue to work

## Navigation

- Header: app name (links home) + avatar/handle dropdown (Feed, Settings, Invite, Sign out)
- Speed-dial FAB (bottom-right, logged-in only): `+` expands to "Share song" and "New setlist" pill buttons
- No separate mobile/desktop nav split — single unified dropdown

## Key decisions

- No central database — everything lives in AT Protocol PDS
- Feed assembled by fetching `app.khord.song` records directly from each followed user's PDS; falls back gracefully from AppView (503) to PDS fetch
- Vote counts fetched in batch from `/api/votes/counts`; displayed with optimistic updates in SongCard
- Odesli does not return Spotify or YouTube Music — confirmed empirically (not a free-tier restriction, just absent); Spotify filled via client credentials; YouTube Music skipped
- No user-level Spotify or Apple Music auth — platform links open natively in user's app
- `/api/resolve` caches Odesli + Spotify results in-process (stable data, no TTL needed)
- AT Protocol OAuth uses redirect flow (not popup); requires a public URL — `npm run tunnel` uses the stable `dev.khord.app` named Cloudflare tunnel
- Spotify Web API requires the developer account owner to have an active Spotify Premium subscription
- Album art URLs sourced from Odesli `thumbnailUrl`; longevity is a known tradeoff; `DISABLE_ALBUM_ART` env var available as CDN reliability escape hatch
- `/api/thumbnail` proxies third-party image URLs server-side to avoid CORS; validates protocol and content-type; 24h cache headers
- App name, tagline, and auth provider name all configurable via env vars (`PUBLIC_APP_NAME`, `PUBLIC_APP_TAGLINE`, `PUBLIC_AUTH_PROVIDER_NAME`)
- Access control: `ALLOWED_DIDS` (allowlist) and `MAX_USERS` (cap) env vars; enforced at OAuth callback via `/api/auth/check`
- SQLite AppView indexer scaffolded — feed/votes API routes exist but app still falls back to PDS fetch when DB unavailable
- Setlists are creator-only writes in v1; collaborator contribution (proposal pattern or delegated writes) is v2
- `svelte-dnd-action` used for drag-to-reorder on setlist detail page
- Theme uses `$env/static/public` (not dynamic) — baked at build time so server and client always agree, preventing hydration mismatches
- Setlist item snapshots are embedded data (not separate records) — keeps setlist as a single atomic AT Protocol record
- `listed` boolean on `app.khord.song`: absent/`true` = appears in feed; `false` = setlist-only. PDS fetch filters in `social.ts`; AppView feed filters with `WHERE listed != 0`. Songs added via the setlist add-song panel default to `listed: false` unless "Also share to feed" is checked
- Post-to-feed compose sheet has fixed header (title+artist with link facet) and footer ("Shared from…") with only the middle note section editable — prevents accidental removal of attribution and ensures consistent post structure
- Setlist canonical URL is `/s/[handle]/[rkey]`; old `/setlists/` path 301-redirects to keep existing links working
- Setlist collaboration uses a proposal pattern (`app.khord.setlist.proposal`) because AT Protocol records are owner-only writes — write-delegation is not viable. Proposals live on the proposer's PDS; discovery is via AppView SQLite (primary) or querying followers' PDSes (503 fallback, also includes owner's own DID for dev/testing). Owner accepts (creates song + appends to setlist) or dismisses (localStorage persistence keyed by rkey). No server-side dismiss state needed.
- `APP_URL` reads from `env.PUBLIC_APP_URL` (dynamic) not a hardcoded constant — required for the share URL to match whichever domain the instance is running on
- Capacitor wrapper planned for iOS/Android
- Setlist export to streaming services planned: Spotify first (user OAuth + ISRC lookup), then Apple Music via MusicKit JS

## Environment variables

| Variable | Description |
|---|---|
| `PUBLIC_APP_URL` | Publicly accessible URL — set to `https://dev.khord.app` for local dev |
| `PUBLIC_APP_NAME` | Display name shown in UI and page titles (default: `Khord`) |
| `PUBLIC_APP_TAGLINE` | One-line tagline on home page (default: `Music, across every platform.`) |
| `PUBLIC_AUTH_PROVIDER_NAME` | Identity provider name shown in sign-in UI (default: `Bluesky`) |
| `PUBLIC_THEME` | UI color theme (default: `dark`); requires rebuild to change — see Theming section |
| `PUBLIC_SPOTIFY_CLIENT_ID` | Spotify app client ID — from developer.spotify.com |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret — server-only, never sent to browser |
| `ALLOWED_DIDS` | Comma-separated AT Protocol DIDs allowed to sign in; unset = open |
| `MAX_USERS` | Max registered users (0 = unlimited); enforced via SQLite `registered_users` count |
| `DISABLE_ALBUM_ART` | Set to `true` to hide album art thumbnails on song cards |
| `INDEXER_DB_PATH` | Path to SQLite DB (default: `/data/khord.db`) |
| `FIREHOSE_RELAY` | AT Protocol firehose relay URL (default: `wss://bsky.network`) |

## Deployment architecture

Two processes, one VPS (e.g. Hetzner CX22 ~€4/mo):

```
Caddy (HTTPS, auto TLS)
  └── SvelteKit app (adapter-node, port 3000)
       └── SQLite /data/khord.db (shared Docker volume)
Firehose indexer (long-running Node process)
  └── SQLite /data/khord.db (same shared volume)
```

**Key files:**

| File | Purpose |
|---|---|
| `Dockerfile` | SvelteKit app image (multi-stage, Node 22 alpine) |
| `indexer/Dockerfile` | Firehose indexer image |
| `indexer/index.js` | AT Protocol firehose subscriber — writes songs/votes to SQLite |
| `indexer/schema.sql` | SQLite schema — actors, songs, votes, cursor tables |
| `docker-compose.yml` | Orchestrates app + indexer + Caddy, shared `sqlite_data` volume |
| `Caddyfile` | Reverse proxy config — replace `khord.app` with your domain |

**Deploying:**
```bash
# On the server
git clone https://github.com/you/khord && cd khord
cp .env.example .env   # fill in values
docker compose up -d
```

**Scaling path:** SQLite in WAL mode handles ~10k users comfortably on a single node. At 100k+ users, migrate to Turso or Postgres — the schema is straightforward to port.

**AppView status:** Indexer + `/api/feed` + `/api/votes/counts` routes are scaffolded. App tries AppView first and falls back to PDS fetch on 503.

## Product context

See `~/Documents/Claude/Khord/CLAUDE.md` for full product/architecture notes.
