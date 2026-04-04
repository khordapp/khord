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
        setlist.ts          # app.khord.setlist types (KhordSetlist, KhordSetlistItem, KhordSetlistRecord)
      social.ts             # fetchSongs, fetchSetlists, fetchSetlist, createSetlist, updateSetlist, deleteSetlist
    odesli/
      client.ts             # resolveUrl(), extractPlatformUrls() (includes songlinkUrl, thumbnailUrl)
    server/
      spotify.ts            # client credentials token + track search (server-only)
      db.ts                 # getDb() read-only / getDbRw() read-write SQLite connections (null if no DB)
      access.ts             # checkAndRegister(did) — ALLOWED_DIDS + MAX_USERS enforcement
    itunes/
      client.ts             # free text search for song discovery
    components/
      ShareSongModal.svelte # search → Odesli resolve → AT Protocol record create; note field (300 char limit)
      SongCard.svelte       # feed card: platform links, preferred highlight, selection, upnote, post-to-feed; no per-card delete
      SongSearch.svelte     # iTunes-backed search input
    stores/
      auth.ts               # session store, isLoggedIn derived
      votes.ts              # user's upvotes, like/unlike actions
      shareSong.ts          # modal open state + lastSharedSong for feed update
      following.ts          # followed users (FollowedUser[])
      prefs.ts              # localStorage-backed user preferences (preferred platform)
      instance.ts           # instanceConfig store (albumArtDisabled) populated from /api/auth/status
  routes/
    +layout.svelte          # shell, nav (desktop + hamburger mobile), FAB, footer with API attribution
    +page.svelte            # home — Feed / Daily / Setlists tabs; selection, bulk delete, create setlist
    login/+page.svelte      # AT Protocol login form; shows instance full/restricted state
    oauth/callback/         # AT Protocol OAuth callback; calls /api/auth/check, signs out if denied
    invite/                 # invite page
    settings/               # preferred streaming service picker
    setlists/[handle]/[rkey]/  # setlist detail: drag reorder, remove items, edit title, delete, share post
    api/resolve/            # server-side Odesli proxy + Spotify augmentation
    api/auth/status/        # GET — returns { restricted, full, albumArtDisabled }
    api/auth/check/         # POST { did } — access control check + register user
    api/feed/               # GET — SQLite AppView feed (returns 503 if DB unavailable)
    api/votes/              # GET — SQLite AppView votes for a DID (returns 503 if DB unavailable)
    api/thumbnail/          # GET ?url= — server-side image proxy for album art (avoids CORS on third-party CDNs)
lexicons/
  app.khord.song.json       # AT Protocol lexicon definitions
  app.khord.vote.json
  app.khord.setlist.json    # setlist lexicon — ordered items[], collaborators[], open flag
indexer/
  index.js                  # AT Protocol firehose subscriber — writes songs/votes to SQLite
  schema.sql                # SQLite schema — actors, songs, votes, cursor, registered_users
  Dockerfile                # includes python3/make/g++ for better-sqlite3 native bindings
```

## AT Protocol lexicons

Records are stored in the user's PDS under these NSIDs:

| NSID | Purpose |
|---|---|
| `app.khord.song` | Shared song — stores Odesli-resolved platform URLs |
| `app.khord.vote` | Up/down vote on a song |
| `app.khord.setlist` | Ordered list of song references; stored on creator's PDS |

### app.khord.setlist

- `title` (required), `description` (optional), `createdAt`
- `items[]` — ordered; each item: `songUri`, `songCid`, `addedBy` (DID), `addedAt`
- `collaborators[]` — DIDs; listed but contribution writes are creator-only in v1
- `open` — boolean; future flag for open contribution (v2)
- Stored on creator's PDS; `updateSetlist` does a full `putRecord` to persist reorders/edits

## Song sharing flow

1. User searches by text (iTunes API) → selects a result
2. Apple Music URL passed to `/api/resolve` (server-side proxy):
   - Calls Odesli → returns Deezer, Tidal, Amazon Music, Apple Music, SoundCloud, song.link page URL
   - Odesli does not return Spotify or YouTube Music — Spotify separately searched via client credentials
3. `app.khord.song` record created in PDS with platform URLs for: Spotify, Apple Music, Deezer, Tidal, Amazon Music, SoundCloud, plus `songlinkUrl` for attribution
4. Feed updates immediately (optimistic prepend via `lastSharedSong` store)

## SongCard behaviour (feed)

- Album art: 48×48 thumbnail top-left (from `record.thumbnailUrl`); hidden if `albumArtDisabled` instance config is set or URL absent
- Selected state: check icon overlays thumbnail (or plain circle if no art); clicking upper card area toggles selection
- "Listen on" label precedes platform pills row
- Preferred platform (set in `/settings`, stored in localStorage) shown first as a branded pill (bg/text/border inline styles)
- Other platforms shown inline (first one visible, rest behind a "More" dropdown anchored bottom-full)
- song.link always shown last in indigo for attribution
- Upnote button bottom-right: expands to show "Upnote"/"Upnoted" text on hover/active
- No per-card delete button — deletion is handled from the feed header
- Note (optional, ≤300 chars) shown below metadata with dynamic left padding matching art/no-art alignment

## Setlist detail page (`/setlists/[handle]/[rkey]`)

- Resolves handle → DID via `getProfile`, then fetches setlist record + all song records in parallel
- Drag-to-reorder via `svelte-dnd-action`; on drop, calls `updateSetlist` with reordered items array
- Per-row streaming pill: preferred platform first (branded), chevron expands dropdown with remaining platforms + song.link; `h-7 items-stretch` ensures pill and chevron are equal height
- Owner can: edit title inline, remove individual songs, delete the entire setlist (with confirm modal)
- Share button opens a compose sheet pre-filled with setlist title + `{APP_URL}/setlists/{handle}/{rkey}`; URL gets a link facet; editable before posting
- Non-owners see the setlist read-only (no drag, no remove, no edit)

## Post-to-feed (cross-post to AT Protocol social)

- "Post" button on each card opens a compose sheet (only when logged in and `songlinkUrl` present)
- Compose sheet pre-fills: "Title by Artist", note (if present), "Shared from {APP_NAME}"
- Title/artist text carries a link facet pointing to `songlinkUrl` — no bare URL in body
- Optional album art toggle (default on if art available and not globally disabled): fetches thumbnail via `/api/thumbnail` proxy, uploads as blob, attaches as `app.bsky.embed.external` pointing to `songlinkUrl`
- User can edit compose text freely before posting; char counter (300 limit, amber ≤20, red over)
- Posts `app.bsky.feed.post` to user's PDS; "Posted" confirmation shown for 3s after success

## Home page tabs

Three tabs rendered in `+page.svelte`, controlled by `activeTab: 'feed' | 'daily' | 'setlists'`:

**Feed** — existing behavior; sticky toolbar with:
- Refresh (reloads + scrolls to top)
- "Setlist" button (violet, appears when songs selected) → create setlist modal with title input + song preview; navigates to new setlist on create
- "Remove N" button (red, appears when songs selected) → confirmation modal listing titles before delete

**Daily** — date-filtered view of feed items; date picker in toolbar; defaults to today; no selection

**Setlists** — lists user's own setlists (lazy-loaded on first tab switch); each row links to `/setlists/[handle]/[rkey]`

## Feed header behaviour

- Sticky toolbar pinned to top of viewport (`sticky top-0`) with frosted glass background
- Refresh button reloads feed and scrolls to top (`window.scrollTo`)
- Delete button appears only when `selectedUris.size > 0`; clicking opens a confirmation modal listing song titles before deletion
- `removeSelected()` deletes all selected songs owned by the current user; clears them from `selectedUris` after
- Selected state (`selectedUris: Set<string>`) tracked in `+page.svelte`

## Key decisions

- No central database — everything lives in AT Protocol PDS
- Feed assembled by fetching `app.khord.song` records directly from each followed user's PDS; falls back gracefully from AppView (503) to PDS fetch
- Vote counts require an AppView — currently only binary liked/unliked state (count display pending AppView wiring)
- Odesli does not return Spotify or YouTube Music — confirmed empirically (not a free-tier restriction, just absent); Spotify filled via client credentials; YouTube Music not yet resolved
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
- Mobile nav uses hamburger menu (hidden `sm:hidden`); desktop nav is `hidden sm:flex`
- Footer includes API attributions: Odesli, iTunes Search API, Spotify Web API, AT Protocol
- Capacitor wrapper planned for iOS/Android

## Environment variables

| Variable | Description |
|---|---|
| `PUBLIC_APP_URL` | Publicly accessible URL — set to `https://dev.khord.app` for local dev |
| `PUBLIC_APP_NAME` | Display name shown in UI and page titles (default: `Khord`) |
| `PUBLIC_APP_TAGLINE` | One-line tagline on home page (default: `Music, across every platform.`) |
| `PUBLIC_AUTH_PROVIDER_NAME` | Identity provider name shown in sign-in UI (default: `Bluesky`) |
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

**AppView status:** Indexer + `/api/feed` + `/api/votes` routes are scaffolded. App tries AppView first and falls back to PDS fetch on 503. Next steps: wire vote counts into `SongCard` UI; wire AppView feed as default when DB is available.

## Product context

See `~/Documents/Claude/Khord/CLAUDE.md` for full product/architecture notes.
