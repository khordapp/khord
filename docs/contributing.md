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

### Tunnel for AT Protocol OAuth

AT Protocol OAuth requires a publicly accessible URL. The included tunnel script starts a Cloudflare tunnel and the dev server together:

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
    atproto/
      agent.ts              # OAuth client, signIn, session helpers
      lexicons/
        song.ts             # app.khord.song types
        vote.ts             # app.khord.vote types
        setlist.ts          # app.khord.setlist types + KhordSetlistItemSnapshot
        proposal.ts         # app.khord.setlist.proposal types
      social.ts             # fetchSongs, fetchSetlists, createSetlist, updateSetlist, createProposal, etc.
    server/
      db.ts                 # SQLite connections (server-only)
      spotify.ts            # Spotify client credentials token + track/playlist search
      deezer.ts             # Deezer track search (no credentials needed)
      youtube.ts            # YouTube Music track/playlist search via Data API v3
      apple.ts              # Apple Music playlist fetch via catalog API + MusicKit token
      access.ts             # OWNER_DIDS, BANNED_DIDS, ALLOWED_DIDS + MAX_USERS enforcement
      settings.ts           # getSetting/setSetting/getAllSettings — DB-backed instance config
    itunes/
      client.ts             # iTunes Search API — free song discovery, no auth
    streaming/
      apple.ts              # Client-side MusicKit JS wrapper (search, auth)
    theme/
      types.ts              # Theme interface (34 tokens)
      index.ts              # Reads PUBLIC_THEME via $env/dynamic/public, exports resolved theme
      dark.ts / light.ts    # Default dark and light themes
      *.ts                  # 16 additional theme variants
    components/
      ShareSongModal.svelte        # Song search → resolve → AT Protocol record create; bottom sheet
      SongCard.svelte              # Feed card: platform links, upnote, post, resync
      SongSearch.svelte            # iTunes-backed search input
      StreamingPill.svelte         # Branded platform pill + chevron dropdown
      StreamingServiceModal.svelte # Preferred platform picker modal
    stores/
      auth.ts               # session, isLoggedIn, authReady
      votes.ts              # upvotes, like/unlike
      shareSong.ts          # share modal state + lastSharedSong
      createSetlist.ts      # create setlist modal state
      following.ts          # followed users
      prefs.ts              # localStorage preferred platform
      instance.ts           # instanceConfig (albumArtDisabled, isOwner, appleMusicEnabled, feedScoped)
      importPlaylist.ts     # import playlist modal state
  routes/
    +layout.svelte          # shell, avatar dropdown/drawer nav, speed-dial FAB, import playlist modal
    +page.svelte            # Feed / Daily / Setlists tabs
    s/[handle]/[rkey]/      # Setlist detail: drag reorder, add songs, proposals, share
    setlists/[handle]/[rkey]/ # 301 redirect → /s/[handle]/[rkey]/
    song/[handle]/[rkey]/   # Public song permalink (SSR OG tags)
    login/+page.svelte      # AT Protocol OAuth login
    oauth/callback/         # OAuth redirect callback
    share/                  # Playlist import + single-link share flow
    settings/               # Preferred streaming service
    invite/                 # Invite page
    admin/                  # Admin panel (owner-only): users, bans, requests, settings, cache
    api/
      resolve/              # GET ?title=&artist= — Spotify + YouTube + Deezer lookup in parallel
      resolve-link/         # GET ?url= — detect and fetch track/playlist from a streaming URL
      feed/                 # AppView feed query (SQLite; 503 if unavailable)
      votes/                # AppView votes for a DID
      votes/counts/         # Batch vote counts for a list of URIs
      proposals/            # Setlist proposals (AppView; PDS fallback on 503)
      thumbnail/            # Server-side image proxy (avoids CORS on third-party CDNs)
      auth/check/           # Access control check + user registration
      auth/status/          # Instance config; accepts ?did= to resolve isOwner
      admin/                # Admin API routes (stats, users, bans, requests, settings) — owner-only
lexicons/
  app.khord.song.json
  app.khord.vote.json
  app.khord.setlist.json
  app.khord.setlist.proposal.json
```

## AT Protocol lexicons

Records are stored in each user's PDS:

| NSID | Purpose |
|---|---|
| `app.khord.song` | Shared song — platform URLs, album art, optional note |
| `app.khord.vote` | Up/down vote on a song |
| `app.khord.setlist` | Ordered list of songs with per-item metadata snapshots; stored on creator's PDS |
| `app.khord.setlist.proposal` | Song proposal submitted by a non-owner; stored on the proposer's PDS; includes embedded song snapshot and optional note |
