# Contributing to Khord

## Dev setup

### Prerequisites

**Node.js**

```bash
# macOS (Homebrew)
brew install node

# macOS/Linux (nvm)
nvm install --lts && nvm use --lts
```

Windows: download the LTS installer from [nodejs.org](https://nodejs.org/) or use `winget install OpenJS.NodeJS.LTS`.

### Run the app

```bash
npm install
cp .env.example .env   # fill in values
npm run dev            # http://localhost:5173
npm run check          # type-check
npm run build
```

### Tunnel for stable dev URLs

Some integrations (Spotify redirect URIs) require a public URL. The included tunnel script starts a Cloudflare tunnel and the dev server together:

```bash
npm run tunnel
```

**Quick tunnel (no account required):** each run generates a random `*.trycloudflare.com` URL. You'll need to update third-party API allowlists (e.g. Spotify) on each restart.

**Named tunnel with a stable URL (recommended):** gives you a permanent subdomain — set API allowlists once. Requires a domain managed by Cloudflare.

```bash
# macOS
brew install cloudflare/cloudflare/cloudflared

# Linux
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Windows: download the installer from https://github.com/cloudflare/cloudflared/releases
```

Then authenticate and create the tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create myapp-dev
cloudflared tunnel route dns myapp-dev dev.myapp.com
```

Update `.env` and `tunnel-dev.sh`:

```bash
PUBLIC_APP_URL=https://dev.myapp.com
# tunnel-dev.sh: TUNNEL_NAME="myapp-dev", TUNNEL_URL="https://dev.myapp.com"
```

## Project structure

```
src/
  lib/
    server/
      db.ts                 # SQLite connections — getDb() (read-only) / getDbRw() (read-write)
      auth.ts               # Session helpers — createSession, getSession
      access.ts             # isOwner checks — OWNER_EMAILS env var + role column
      spotify.ts            # Spotify client credentials token + track/playlist search
      deezer.ts             # Deezer track search (no credentials needed)
      youtube.ts            # YouTube Music track/playlist search via Data API v3
      apple.ts              # Apple Music playlist fetch via catalog API + MusicKit token
      settings.ts           # getSetting/setSetting/getAllSettings — DB-backed instance config
      thumbnailCache.ts     # Server-side album art disk cache
    itunes/
      client.ts             # iTunes Search API — free song discovery, no auth
    streaming/
      apple.ts              # Client-side MusicKit JS wrapper (search, auth)
      spotify.ts            # Client-side Spotify user OAuth helpers
    theme/
      types.ts              # Theme interface (34 tokens)
      index.ts              # Reads PUBLIC_THEME via $env/dynamic/public, exports resolved theme
      dark.ts / light.ts    # Default dark and light themes
      *.ts                  # 16 additional theme variants
    components/
      ShareSongModal.svelte        # Song search → resolve → POST /api/songs; bottom sheet
      SongCard.svelte              # Feed card: platform links, upnote, resync
      SongSearch.svelte            # iTunes-backed search input
      StreamingPill.svelte         # Branded platform pill + chevron dropdown
      StreamingServiceModal.svelte # Preferred platform picker modal
    stores/
      auth.ts               # session, isLoggedIn
      votes.ts              # upvotes, like/unlike (loads from /api/votes/mine)
      shareSong.ts          # share modal state + lastSharedSong
      createSetlist.ts      # create setlist modal state
      prefs.ts              # localStorage preferred platform
      instance.ts           # instanceConfig (albumArtDisabled, isOwner, appleMusicEnabled, feedScoped)
      importPlaylist.ts     # import playlist modal state
  routes/
    +layout.svelte          # shell, avatar dropdown/drawer nav, speed-dial FAB, import playlist modal
    +page.svelte            # Feed / Daily / Setlists tabs
    s/[id]/                 # Setlist detail: drag reorder, add songs, proposals, share
    song/[id]/              # Public song permalink (SSR OG tags)
    login/+page.svelte      # Email + password login / register
    share/                  # Playlist import + single-link share flow
    settings/               # Preferred streaming service, appearance
    invite/                 # Invite page
    admin/                  # Admin panel (owner-only): users, bans, requests, settings, cache
    api/
      auth/login/           # POST — email + password login
      auth/register/        # POST — new account registration
      auth/logout/          # POST — session invalidation
      auth/status/          # GET — instance config + isOwner for current session
      auth/delete-data/     # POST — delete current user's songs/votes/setlists
      songs/                # POST — create song; GET — song list
      songs/[id]/           # GET — single song; DELETE — remove; PATCH — resync metadata
      setlists/             # POST — create setlist
      setlists/[id]/        # GET — setlist detail; PATCH — update; DELETE — delete
      setlists/[id]/items/  # POST — add song; reorder
      setlists/[id]/items/[itemId]/ # DELETE — remove item
      votes/                # POST — upvote song or setlist
      votes/[id]/           # DELETE — remove vote
      votes/mine/           # GET — all votes for current session user
      votes/counts/         # GET ?songIds= — batch vote counts
      proposals/            # GET ?setlistId= — proposals for a setlist
      proposals/[id]/       # POST accept/dismiss
      resolve/              # GET ?title=&artist= — Spotify + YouTube + Deezer lookup in parallel
      resolve-link/         # GET ?url= — detect and fetch track/playlist from a streaming URL
      thumbnail/            # Server-side image proxy (avoids CORS on third-party CDNs)
      admin/                # Admin API routes (stats, users, bans, requests, settings) — owner-only
```

## Schema

All data lives in SQLite. The schema is created automatically on first run via `getDb()` in `src/lib/server/db.ts`.

| Table | Contents |
|---|---|
| `users` | `id, username, email, password_hash, display_name, role, created_at` |
| `sessions` | `token, user_id, created_at` |
| `songs` | `id, user_id, title, artist, album, thumbnail_url, platform URLs, note, listed, created_at` |
| `votes` | `id, user_id, song_id, setlist_id, created_at` |
| `setlists` | `id, user_id, title, description, open, created_at, updated_at` |
| `setlist_items` | `id, setlist_id, song_id, added_by_user_id, position, snapshot (JSON), added_at` |
| `proposals` | `id, setlist_id, proposer_user_id, snapshot (JSON), note, created_at` |
| `banned_users` | `user_id INTEGER PK` |
| `instance_settings` | `key, value` |
| `access_requests` | `id, username, email, status, created_at` |
