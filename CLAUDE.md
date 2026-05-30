# Khord

Music sharing platform across streaming services. Users share songs stored in a central SQLite database; listeners open tracks on whichever platform they prefer (Spotify, Apple Music, YouTube Music, Deezer). Artist/platform revenue flows naturally since playback is native on each platform.

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
- **SQLite** (`better-sqlite3`) — all app data (songs, setlists, votes, users, sessions)
- **bcryptjs** — password hashing
- **iTunes Search API** — free text search for song discovery (no auth); provides Apple Music URL + artwork
- **Spotify Web API** — client credentials search for track URLs (server-only); user OAuth for playlist export
- **Apple Music / MusicKit** — playlist import/export (requires dev token)
- **Deezer API** — free search for track URLs (no credentials required, always-on)
- **YouTube Music** — via YouTube Data API v3 (optional; disabled by default due to quota limits)
- **phosphor-svelte** — icon pack
- **svelte-dnd-action** — drag-to-reorder on setlist detail page

## Project structure

```
src/
  lib/
    server/
      auth.ts               # createSession / getSession / deleteSession / purgeExpiredSessions; 30-day session tokens stored in SQLite
      db.ts                 # getDb() / getDbRw() — SQLite connections; schema: songs, setlists, setlist_items, votes, proposals, users, sessions, banned_users, access_requests, instance_settings, notification_tokens
      access.ts             # isOwnerUser(username, email) — checks OWNER_EMAILS env var; isOwnerById(userId) — checks role='admin' in DB
      settings.ts           # getSetting / setSetting / getAllSettings — instance_settings SQLite table; DB values override env var defaults without restart
      spotify.ts            # client credentials token + track search (server-only)
      deezer.ts             # free Deezer track search — no credentials needed (always-on)
      youtube.ts            # YouTube Music track search via Data API v3 (server-only; disabled by default)
      apple.ts              # Apple Music API — playlist import (requires dev token from DB setting or env var)
      thumbnailCache.ts     # disk cache for proxied album art (/data/thumbnails); hash-keyed filenames prevent path traversal
    streaming/
      spotify.ts            # Spotify user OAuth token refresh + playlist export operations (client-side token storage in localStorage)
      apple.ts              # Apple Music user auth + playlist operations (MusicKit JS)
    itunes/
      client.ts             # free text search for song discovery
    theme/
      types.ts              # Theme interface (34 tokens including heroGradient)
      dark.ts               # default: zinc-950 base, white CTA, violet accent
      light.ts              # gray-100 base, gray-900 CTA, violet/indigo accent
      slate.ts / gray.ts / neutral.ts / stone.ts          # neutral dark variants
      slate-light.ts / zinc-light.ts / neutral-light.ts / stone-light.ts  # neutral light variants
      navy.ts / teal.ts / emerald.ts / rose.ts / violet.ts  # chromatic dark variants
      index.ts              # reads PUBLIC_THEME, exports resolved `theme` object
    components/
      ShareSongModal.svelte        # search → /api/resolve (Spotify+YouTube+Deezer in parallel) → POST /api/songs; note field (300 char limit)
      SongCard.svelte              # feed card: platform links, selection, upnote, resync metadata
      SongSearch.svelte            # iTunes-backed search input
      StreamingPill.svelte         # branded pill + chevron dropdown; preferred platform first; play icon on primary; bottom-sheet on mobile; shared by feed + setlists
      StreamingServiceModal.svelte # modal for setting preferred streaming platform; all screen sizes
    landing.svelte          # editable logged-out landing content (below hero); replace to customise per instance
    stores/
      auth.ts               # session store, isLoggedIn derived, authReady (gates post-login loads)
      votes.ts              # user's upvotes for songs + setlists; like/unlike actions
      shareSong.ts          # modal open state + lastSharedSong for feed update + prefilledTrack
      createSetlist.ts      # modal open state + pending song IDs
      instance.ts           # instanceConfig store (albumArtDisabled, isOwner, feedScoped, appleMusicEnabled, loaded) populated from /api/auth/status; loaded flag gates admin page auth check
      prefs.ts              # localStorage-backed user preferences (preferred streaming platform)
      spotify.ts            # Spotify user OAuth tokens (localStorage); getValidToken() with refresh
      appleMusic.ts         # Apple Music token management
      importPlaylist.ts     # playlist import modal state
      musicService.ts       # active music service selection
  routes/
    +layout.svelte          # shell, mobile bottom nav + desktop header nav, speed-dial FAB (share song / new mixtape / import playlist), account drawer/dropdown
    +page.svelte            # home — All Songs / Daily / Mixtapes tabs; selection, bulk delete, create setlist; pull-to-refresh + swipe tab navigation
    login/+page.svelte      # email + password login form; shows instance full/restricted/invite-only state
    settings/               # preferred streaming service (opens StreamingServiceModal); appearance toggle
    invite/                 # invite page
    admin/                  # owner-only admin panel (users, bans, requests, instance settings, cache); tab bar on desktop, section select on mobile
    s/[id]/                 # setlist detail: drag reorder, add songs, propose songs, review proposals, share, export to Spotify/Apple Music
    song/[id]/              # public song permalink; SSR OG tags; SongCard in publicView mode; join CTA for logged-out visitors
    spotify/callback/       # Spotify user OAuth callback
    api/
      auth/login/           # POST { email, password } → session cookie
      auth/register/        # POST { email, username, password } → create user + session; respects registration_closed, invite_only, MAX_USERS
      auth/logout/          # POST → delete session
      auth/status/          # GET → { restricted, full, albumArtDisabled, inviteOnly, feedScoped, isOwner, appleMusicEnabled }
      auth/notif-token/     # POST → store Capacitor push notification token
      auth/delete-data/     # DELETE → remove account + cascade delete songs/setlists/votes
      songs/                # GET (paginated feed) / POST (create song)
      songs/[id]/           # GET / PUT (resync URLs) / DELETE
      setlists/             # GET (user's setlists) / POST (create)
      setlists/[id]/        # GET (with items + vote counts) / PUT / DELETE
      setlists/[id]/items/  # POST (add song) / DELETE (remove all)
      setlists/[id]/items/[itemId]/ # PUT (reorder) / DELETE
      votes/                # POST (like) / GET (mine)
      votes/[id]/           # DELETE (unlike)
      votes/counts/         # GET ?songIds=...&setlistIds=... → batch vote tallies
      votes/mine/           # GET → user's vote map
      feed/                 # GET ?limit=50 → paginated songs (SQLite)
      feed/new/             # GET → new songs since timestamp (for notifications)
      profile/              # GET / PUT (display name, public flag)
      profile/avatar/       # PUT → upload avatar image blob
      avatar/[id]/          # GET → serve avatar blob
      resolve/              # GET ?title=&artist= — Spotify + YouTube + Deezer lookup in parallel; returns { spotifyUrl?, youtubeMusicUrl?, deezerUrl? }
      resolve-link/         # GET ?url= — extract ISRC from URL, resolve on Spotify
      thumbnail/            # GET ?url= — server-side image proxy for album art; validates protocol + content-type; disk-cached
      pinned-setlists/      # GET / POST / DELETE (admin-controlled pinned setlists)
      proposals/            # GET ?setlistId= / POST (propose song to setlist)
      proposals/[id]/       # PUT (accept) / DELETE (dismiss)
      admin/users/          # GET — paginated registered users; owner-only
      admin/bans/           # GET / POST / DELETE — ban list + add/remove; owner-only
      admin/requests/       # GET / POST (approve) / DELETE (decline) — access request list; owner-only
      admin/settings/       # GET / POST — instance settings; owner-only
      admin/stats/          # GET — instance stats (user count, song count, ban count, pending requests); owner-only
      admin/reset/          # POST — reset instance data; owner-only
      admin/thumbnails/     # DELETE — purge thumbnail disk cache; owner-only
```

## Data model (SQLite)

All data lives in a single SQLite database. Key tables:

| Table | Purpose |
|---|---|
| `users` | id, username, email, password_hash, role (user/admin), display_name, avatar BLOB, avatar_mime, profile_public |
| `sessions` | token, user_id, expires_at |
| `songs` | id, user_id, title, artist, album, thumbnail_url, apple_music_url, spotify_url, youtube_music_url, deezer_url, note, listed (1=feed, 0=setlist-only), urls_resolved_at, created_at |
| `setlists` | id, user_id, title, description, created_at |
| `setlist_items` | id, setlist_id, song_id, position, added_at |
| `votes` | id, user_id, song_id (or setlist_id), created_at |
| `proposals` | id, setlist_id, user_id, song snapshot JSON, note, status, created_at |
| `banned_users` | user_id, banned_at |
| `access_requests` | id, username, email, status (pending/approved/declined), created_at |
| `instance_settings` | key, value |
| `notification_tokens` | user_id, token, platform |

## Theming

Themes are selected via `PUBLIC_THEME` in `.env`. A rebuild (or dev server restart) is required when changing the value — `$env/static/public` is used so server and client always agree.

| Category | Values |
|---|---|
| Neutral dark | `dark` (default), `zinc`, `slate`, `gray`, `neutral`, `stone` |
| Neutral light | `light`, `zinc-light`, `slate-light`, `neutral-light`, `stone-light` |
| Chromatic dark | `navy`, `teal`, `emerald`, `rose`, `violet` |

The `Theme` interface has 34 typed string tokens covering backgrounds, borders, text, interactive states, primary CTA, accent, link colors, and `heroGradient` (a complementary gradient bloom used on the logged-out landing page hero). All values are complete Tailwind class strings so JIT scanning works without safelisting.

To add a new theme: create `src/lib/theme/mytheme.ts` implementing `Theme`, then register it in `src/lib/theme/index.ts`.

## Song sharing flow

1. User searches by text (iTunes API) → selects a result; iTunes provides title, artist, album, Apple Music URL, artwork
2. `/api/resolve?title=...&artist=...` called — runs Spotify + YouTube Music + Deezer lookups in parallel (~300ms)
3. `POST /api/songs` stores record in SQLite with all resolved platform URLs + optional note
4. Feed updates immediately (optimistic prepend via `lastSharedSong` store)

## SongCard behaviour (feed)

- Album art: 48×48 thumbnail top-left (from `thumbnailUrl`); hidden if `albumArtDisabled` instance config is set or URL absent
- Selected state: check icon overlays thumbnail (or plain circle if no art); clicking upper card area toggles selection
- Preferred platform (set in `/settings`, stored in localStorage) shown first as a branded pill via `StreamingPill`; remaining platforms behind a chevron dropdown
- Action row (bottom-right): Resync (owner-only) → Upnote; pill-style buttons (icon + always-visible label) with tooltips; no expand-on-hover layout shift
- Resync: calls `/api/resolve?title=...&artist=...` to refresh Spotify/YouTube/Deezer URLs, does a `PUT /api/songs/[id]` to update the DB record; updates card reactively
- No per-card delete button — deletion is handled from the feed header
- Note (optional, ≤300 chars) shown below metadata with dynamic left padding matching art/no-art alignment

## Setlist detail page (`/s/[id]`)

- Fetches setlist record + all song items from SQLite; displays song metadata, vote counts, streaming pills per row
- Drag-to-reorder via `svelte-dnd-action`; on drop, `PUT /api/setlists/[id]/items/[itemId]` persists new position
- Owner can: edit title inline, remove individual songs, delete the entire setlist (with confirm modal)
- Owner "Add song" panel: search → `/api/resolve` → `POST /api/songs` + `POST /api/setlists/[id]/items`; "Also share to feed" checkbox (default unchecked) controls `listed` field on the created song record
- Share button opens a compose sheet pre-filled with setlist title + URL
- Non-owners see the setlist read-only (no drag, no remove, no edit)
- Vote counts fetched from `/api/votes/counts` and displayed per row
- Export to Spotify: uses stored Spotify user OAuth token to create a playlist via ISRC lookup (`/api/resolve-link`)
- Export to Apple Music: uses MusicKit JS to create a playlist in the user's Apple Music library
- **Proposals (owner):** loaded from `/api/proposals?setlistId=...`; accepted proposals create a song + append to setlist; dismissed proposals removed from in-memory list (localStorage persistence keyed by setlist id prevents reappearance on reload)
- **Propose a song (non-owner):** "Propose a song" button visible to logged-in non-owners; panel: iTunes search → resolve → `POST /api/proposals`; submitted state shown for 2s then panel closes

## Home page tabs

Three tabs in `+page.svelte`, controlled by `activeTab: 'feed' | 'daily' | 'setlists'`. Pull-to-refresh (vertical drag) reloads the current tab. Horizontal swipe switches tabs.

**All Songs** — sticky toolbar with:
- Refresh (reloads + scrolls to top)
- "Mixtape (N)" button (accent color, appears when songs selected) → create setlist modal
- "Remove N" button (red, appears when songs selected) → confirmation modal before deletion
- Song cards are selectable; `selectedIds: Set<number>` tracked in `+page.svelte`

**Daily** — date-filtered view of feed items; date picker in toolbar; defaults to today
- Songs are selectable; `dailySelectedIds` is a separate set, reset when date changes
- "Mixtape all" button always visible when songs exist; pre-fills modal with all items for the day

**Mixtapes** — lists user's own setlists (lazy-loaded on first tab switch); each row links to `/s/[id]`; vote count, like/unlike, export options, share

## Navigation

- **Mobile (< 640px):** bottom nav bar (Feed | Daily | + FAB | Mixtapes | Settings); avatar opens right-side account drawer (`fly` transition) with large tap targets
- **Desktop (≥ 640px):** header with app name + account dropdown; speed-dial FAB (bottom-right, logged-in only) expands to "Share song" / "New mixtape" / "Import playlist" pill buttons
- Account menu includes: profile + avatar, streaming service quick selector, Settings, Invite, Admin (if owner), theme toggle, Sign out

## Key decisions

- Centralized SQLite database — all data owned by the instance; straightforward backup/migration
- Auth: email + password with bcrypt (cost 12) + 30-day session tokens stored in DB; sessions purged on logout
- Owner identity: `OWNER_EMAILS` env var (comma-separated) promotes matching email to `role='admin'` at registration; admins can also be promoted directly in the DB
- Access control: `registration_closed`, `invite_only`, `max_users` instance settings (DB table, override without restart); `banned_users` table for dynamic bans (no restart needed)
- Invite-only mode: on first sign-in attempt, a request is auto-submitted and registration returns a "pending review" response; existing registered users are unaffected; owner approves/declines via admin Requests tab
- Admin panel at `/admin` (owner-only): users, ban management, access request review, instance settings, cache management; tab bar on desktop, full-width `<select>` section picker on mobile; all `/api/admin/*` routes verify `isOwnerById(session.userId)` server-side
- `/api/resolve` runs Spotify + YouTube + Deezer lookups in parallel; no caching (per-query, not URL-stable)
- Deezer: free public search API (no credentials, always-on); Spotify: client credentials (server-only); YouTube Music: Data API v3 key (disabled by default due to quota)
- Spotify Web API requires the developer account owner to have an active Spotify Premium subscription
- `listed` column on songs: `1` (default) = appears in feed; `0` = setlist-only; songs added via the setlist add-song panel default to `listed=0` unless "Also share to feed" is checked
- Setlist proposals stored in `proposals` table (not on proposer's device); accepted proposals create a `songs` row + `setlist_items` row; dismissed proposals tracked in localStorage keyed by setlist id
- Album art URLs sourced from iTunes CDN (`artworkUrl` from iTunes Search API); longevity is a known tradeoff; `DISABLE_ALBUM_ART` env var available as CDN reliability escape hatch
- `/api/thumbnail` proxies third-party image URLs server-side to avoid CORS; validates protocol (`http`/`https`) + content-type; disk-cached in `THUMBNAIL_CACHE_DIR`
- Apple Music playlist import: controlled by `apple_music_enabled` DB setting (admin toggle, default false); developer token read from `apple_music_dev_token` DB setting first, then `PUBLIC_APPLE_MUSIC_DEV_TOKEN` env var — allows token rotation without restart
- Spotify user OAuth: access/refresh tokens stored in localStorage (`src/lib/stores/spotify.ts`); `getValidToken()` auto-refreshes; used for playlist export from setlist detail page
- Theme uses `$env/dynamic/public` — read at server startup; changing `PUBLIC_THEME` in Docker/Unraid takes effect on container restart without rebuilding
- App name and tagline configurable via `PUBLIC_APP_NAME` and `PUBLIC_APP_TAGLINE` env vars
- `PUBLIC_APP_URL` reads from `$env/dynamic/public` — required for share URLs to match whichever domain the instance is running on
- Capacitor wrapper: Android build complete (in testing); iOS not yet started. Background notifications use 15-min WorkManager polling (bearer token → `/api/feed/new`) rather than FCM — FCM requires a shared Firebase project whose service account key every self-hosted instance would need, which is impractical for a purely self-hosted product. Polling is the correct approach here.
- `@atproto/*` packages remain in `package.json` but are unused — safe to remove

## Adding Tidal (future point release)

Pattern: identical to `src/lib/server/spotify.ts`.

1. Register at developer.tidal.com → get client_id + client_secret
2. Add env vars: `TIDAL_CLIENT_ID` (public), `TIDAL_CLIENT_SECRET` (private)
3. Create `src/lib/server/tidal.ts`:
   - OAuth2 client credentials token via POST to `https://auth.tidal.com/v1/oauth2/token`
   - Search via GET `https://openapi.tidal.com/v2/searchresults/{query}/relationships/tracks?countryCode=US&limit=1`
   - Return first result's track URL (construct as `https://tidal.com/browse/track/{id}`)
   - Cache token with expiry buffer (same pattern as `spotify.ts`)
4. Add `TIDAL_CLIENT_ID` to `.env.example` with a comment
5. Add admin toggle: `tidal_enabled` instance setting (default `false` — requires credentials)
6. Add to `Promise.all` in `src/routes/api/resolve/+server.ts` (guarded by setting), return `tidalUrl`
7. PLATFORMS arrays in `SongCard.svelte`, `StreamingPill.svelte`, `StreamingServiceModal.svelte` already include `tidalUrl` — no UI changes needed
8. Verify: `npm run check`; share a track; confirm Tidal pill appears

## Environment variables

| Variable | Description |
|---|---|
| `PUBLIC_APP_URL` | Publicly accessible URL — set to `https://dev.khord.app` for local dev |
| `PUBLIC_APP_NAME` | Display name shown in UI and page titles (default: `Khord`) |
| `PUBLIC_APP_TAGLINE` | One-line tagline on home page (default: `Share music, listen anywhere.`) |
| `PUBLIC_THEME` | UI color theme (default: `dark`); requires rebuild to change — see Theming section |
| `PUBLIC_SPOTIFY_CLIENT_ID` | Spotify app client ID — from developer.spotify.com |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret — server-only, never sent to browser |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key — enables YouTube Music links; toggle per instance in admin settings |
| `PUBLIC_APPLE_MUSIC_DEV_TOKEN` | MusicKit JWT developer token — enables Apple Music; can also be set/updated via the admin panel without a restart |
| `OWNER_EMAILS` | Comma-separated email addresses with owner/admin privileges; matched at registration to set `role='admin'` |
| `MAX_USERS` | Max registered users (0 = unlimited); overridden by `max_users` instance setting |
| `DISABLE_ALBUM_ART` | Set to `true` to hide album art thumbnails on song cards |
| `THUMBNAIL_CACHE_DIR` | Directory for cached album art (default: `/data/thumbnails`) |
| `INDEXER_DB_NAME` | Database filename only (e.g. `khord.db`) — Unraid-preferred; path constructed as `/data/{name}`. Takes precedence over `INDEXER_DB_PATH`. |
| `INDEXER_DB_PATH` | Full path to SQLite DB (default: `/data/khord.db`) — Docker Compose style; ignored when `INDEXER_DB_NAME` is set |

## Deployment architecture

Single process, one VPS (e.g. Hetzner CX22 ~€4/mo):

```
Caddy (HTTPS, auto TLS)
  └── SvelteKit app (adapter-node, port 3000)
       └── SQLite /data/khord.db
```

**Key files:**

| File | Purpose |
|---|---|
| `Dockerfile` | SvelteKit app image (multi-stage, Node 22 alpine) |
| `docker-compose.yml` | Orchestrates app + Caddy |
| `Caddyfile` | Reverse proxy config — replace `khord.app` with your domain |

**Deploying:**
```bash
# On the server
git clone https://github.com/khordapp/khord && cd khord
cp .env.example .env   # fill in values
docker compose up -d
```

**Scaling path:** SQLite in WAL mode handles ~10k users comfortably on a single node. At 100k+ users, migrate to Turso or Postgres — the schema is straightforward to port.

## Product context

See `~/Documents/Claude/Khord/CLAUDE.md` for full product/architecture notes.
