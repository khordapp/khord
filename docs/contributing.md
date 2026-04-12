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
    odesli/
      client.ts             # resolveUrl(), extractPlatformUrls()
    server/
      db.ts                 # SQLite connections (server-only)
      spotify.ts            # Spotify client credentials token + search
      access.ts             # OWNER_DIDS, BANNED_DIDS, ALLOWED_DIDS + MAX_USERS enforcement
    itunes/
      client.ts             # iTunes Search API
    theme/
      types.ts              # Theme interface (33 tokens)
      index.ts              # Reads PUBLIC_THEME, exports resolved theme
      dark.ts / light.ts    # Default dark and light themes
      *.ts                  # 16 additional theme variants
    components/
      ShareSongModal.svelte    # Song search → resolve → AT Protocol record create
      CreateSetlistModal.svelte # Setlist creation with song search
      SongCard.svelte          # Feed card: platform links, upnote, post, resync
      SongSearch.svelte        # iTunes-backed search input
      StreamingPill.svelte     # Branded platform pill + chevron dropdown
      ServicePicker.svelte     # Preferred platform picker
    stores/
      auth.ts               # session, isLoggedIn, authReady
      votes.ts              # upvotes, like/unlike
      shareSong.ts          # share modal state + lastSharedSong
      createSetlist.ts      # create setlist modal state
      following.ts          # followed users
      prefs.ts              # localStorage preferred platform
      instance.ts           # instanceConfig (albumArtDisabled, isOwner)
  routes/
    +layout.svelte          # shell, avatar dropdown nav, speed-dial FAB, footer with attributions
    +page.svelte            # All Songs / Following / Daily / Setlists tabs; logged-out hero
    s/[handle]/[rkey]/        # Setlist detail: drag reorder, add songs, share, edit
    setlists/[handle]/[rkey]/ # 301 redirect → /s/[handle]/[rkey]/
    login/+page.svelte      # AT Protocol OAuth login
    oauth/callback/         # OAuth redirect callback
    spotify/callback/       # Spotify OAuth callback
    settings/               # Preferred streaming service
    invite/                 # Invite page
    admin/                  # Admin panel (owner-only): users, bans, instance settings
    api/
      resolve/              # Odesli proxy + Spotify augmentation
      feed/                 # AppView feed query (SQLite)
      votes/                # AppView votes query (SQLite)
      votes/counts/         # Batch vote counts for a list of URIs
      proposals/            # Setlist proposals from AppView (PDS fallback on 503)
      thumbnail/            # Image proxy (avoids CORS on third-party CDNs)
      auth/check/           # Access control check + user registration
      auth/status/          # Instance config; accepts ?did= to resolve isOwner
      admin/                # Admin API routes (stats, users, bans, settings) — owner-only
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
