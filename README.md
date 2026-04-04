# Khord

Decentralized social platform for sharing music across streaming services. Share a song once — listeners hear it on whichever platform they already use (Spotify, Apple Music, YouTube Music, etc.). Artist and platform revenue flows naturally since playback is native on each service.

User identity and social records are stored in an [AT Protocol](https://atproto.com/) PDS. No central database for user data — an optional SQLite AppView indexes records for faster feed queries.

## Features

- **Feed** — songs shared by people you follow, assembled from their AT Protocol PDS
- **Daily setlist** — date-filtered view of shared songs; defaults to today
- **Setlists** — curated, ordered playlists stored as AT Protocol records; drag to reorder; shareable via link
- **Cross-platform links** — preferred streaming service shown first with brand colors; others in a dropdown
- **Post to Bluesky** — cross-post any song or setlist with a link facet and optional album art embed
- **Notes** — optional text attached to a shared song (up to 300 characters)
- **Album art** — thumbnails sourced from Odesli; can be disabled per instance
- **Instance config** — app name, tagline, identity provider, and access control all configurable via env vars

## Stack

- [SvelteKit](https://kit.svelte.dev/) + TypeScript + TailwindCSS
- [@atproto/api](https://github.com/bluesky-social/atproto) — user identity, AT Protocol OAuth, record storage
- [Odesli API](https://odesli.co/) (song.link) — cross-platform URL resolution
- [Spotify Web API](https://developer.spotify.com/) — client credentials search (fills Spotify gap left by Odesli)
- iTunes Search API — free text search for song discovery
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — AppView index (optional, falls back to direct PDS fetch)
- [svelte-dnd-action](https://github.com/isaacHagoel/svelte-dnd-action) — drag-to-reorder for setlists

## Getting started

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
cp .env.example .env   # fill in values — see Environment variables below
npm run dev            # http://localhost:5173
npm run check          # type-check
npm run build
```

### Tunnel for local AT Protocol OAuth

AT Protocol OAuth requires a publicly accessible URL. The included tunnel script starts a Cloudflare tunnel and the dev server together:

```bash
npm run tunnel
```

#### Quick tunnel (no account required)

Each run generates a random `*.trycloudflare.com` URL. You'll need to update third-party API allowlists (e.g. Spotify) on each restart.

#### Named tunnel with a stable URL (recommended)

A named tunnel gives you a permanent subdomain — set API allowlists once.

**Requires:** a domain managed by Cloudflare.

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

Then update `.env` and `tunnel-dev.sh`:

```bash
PUBLIC_APP_URL=https://dev.myapp.com
# tunnel-dev.sh: TUNNEL_NAME="myapp-dev", TUNNEL_URL="https://dev.myapp.com"
```

## Environment variables

| Variable | Description |
|---|---|
| `PUBLIC_APP_URL` | Publicly accessible URL (e.g. `https://dev.myapp.com` for local dev) |
| `PUBLIC_APP_NAME` | Display name in UI and page titles (default: `Khord`) |
| `PUBLIC_APP_TAGLINE` | Tagline on the home page (default: `Music, across every platform.`) |
| `PUBLIC_AUTH_PROVIDER_NAME` | Identity provider name in sign-in UI (default: `Bluesky`) |
| `PUBLIC_SPOTIFY_CLIENT_ID` | Spotify app client ID — from developer.spotify.com |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret — server-only |
| `ALLOWED_DIDS` | Comma-separated AT Protocol DIDs allowed to sign in; unset = open registration |
| `MAX_USERS` | Max registered users (0 = unlimited) |
| `DISABLE_ALBUM_ART` | Set to `true` to hide album art thumbnails globally |
| `INDEXER_DB_PATH` | Path to SQLite DB (default: `/data/khord.db`) |
| `FIREHOSE_RELAY` | AT Protocol firehose relay URL (default: `wss://bsky.network`) |

## AT Protocol lexicons

Records are stored in the user's PDS:

| NSID | Purpose |
|---|---|
| `app.khord.song` | Shared song — platform URLs, album art, optional note |
| `app.khord.vote` | Up/down vote on a song |
| `app.khord.setlist` | Ordered list of songs; stored on creator's PDS |

## How it works

1. User searches for a song (iTunes API) and selects a result
2. Apple Music URL sent to `/api/resolve`:
   - Odesli resolves platform links (Apple Music, Deezer, Tidal, Amazon Music, SoundCloud, song.link)
   - Spotify searched separately via client credentials (Odesli omits Spotify and YouTube Music)
3. `app.khord.song` record written to user's AT Protocol PDS
4. Feed assembled from SQLite AppView (if running) or direct PDS fetches (fallback)
5. Listeners open songs in their preferred platform — no in-app playback

## Deploying

Docker Compose handles the full stack — SvelteKit app, firehose indexer, and Caddy reverse proxy with automatic HTTPS.

### Architecture

```
Caddy (HTTPS, auto TLS)  ← ports 80/443
  └── SvelteKit app (port 3000)
       └── SQLite /data/khord.db  ← shared Docker volume
Firehose indexer (long-running Node process)
  └── SQLite /data/khord.db
```

### Prerequisites

- A VPS with Docker and Docker Compose (e.g. Hetzner CX22 ~€4/mo)
- A domain with an A record pointed at the server
- Ports 80 and 443 open

```bash
# Install Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
```

### Deploy

```bash
git clone https://github.com/you/khord && cd khord
cp .env.example .env          # fill in values
# Edit Caddyfile: replace khord.app with your domain
docker compose up -d --build
```

### Update

```bash
git pull
docker compose up -d --build
```

Caddy and the SQLite volume persist across rebuilds.

### Backups

```bash
# Safe to run live — SQLite WAL mode
docker compose exec app sqlite3 /data/khord.db ".backup /data/khord.backup.db"
scp user@yourserver:/var/lib/docker/volumes/khord_sqlite_data/_data/khord.backup.db ./
```

For automated backups, [Litestream](https://litestream.io/) can stream WAL changes to S3-compatible storage.

**Scaling:** SQLite in WAL mode handles ~10k users on a single node. At 100k+, migrate to Turso or Postgres.

### Running on Unraid

Unraid runs Docker natively. The setup is the same as a standard VPS but with a few Unraid-specific conventions.

#### Prerequisites

- [Docker Compose Manager](https://forums.unraid.net/topic/114415-plugin-docker-compose-manager/) plugin installed from Community Applications
- A domain pointed at your Unraid server's IP (or local hostname for LAN-only use)
- Ports 80 and 443 forwarded to Unraid in your router (if exposing externally)

> **Note:** If you already use NGINX Proxy Manager (or Swag) on Unraid, those containers likely own ports 80/443. Skip the Caddy container and point your existing reverse proxy at Khord's app container on port 3000 instead. See [Without Caddy](#without-caddy) below.

#### Setup

Open the Unraid terminal (via the web UI or SSH) and clone the repo into your appdata share:

```bash
cd /mnt/user/appdata
git clone https://github.com/you/khord
cd khord
cp .env.example .env
nano .env          # fill in values; set PUBLIC_APP_URL to your domain
```

Edit the `Caddyfile` and replace `khord.app` with your domain. Then in the Docker Compose Manager plugin, point it at `/mnt/user/appdata/khord/docker-compose.yml` and start the stack.

The SQLite database will be stored in a Docker volume (`khord_sqlite_data`). To keep it in your appdata instead, bind-mount it by editing `docker-compose.yml`:

```yaml
# In the app and indexer services, replace the volume mount:
volumes:
  - /mnt/user/appdata/khord/data:/data
```

Then remove the `sqlite_data` volume definition at the bottom of the file.

#### Without Caddy

If a reverse proxy is already running on Unraid, remove the `caddy` service from `docker-compose.yml` and expose the app on a free port:

```yaml
# In the app service:
ports:
  - "3456:3000"   # pick any free port
```

Then add a proxy host in NGINX Proxy Manager (or equivalent) pointing `yourdomain.com` → `http://khord-app-1:3000` (using the container name on the Docker bridge network), or `http://unraid-ip:3456` if routing by host port.

#### Updates

```bash
cd /mnt/user/appdata/khord
git pull
```

Then use the Docker Compose Manager plugin to rebuild and restart the stack.

#### Backups

The Unraid Appdata Backup plugin will not capture the Docker volume by default. Use one of:

```bash
# Manual snapshot (safe to run live)
docker compose exec app sqlite3 /data/khord.db ".backup /data/khord.backup.db"
# File is then at /mnt/user/appdata/khord/data/khord.backup.db if using the bind-mount above
```

Or configure [Litestream](https://litestream.io/) to stream WAL changes to a local path or S3-compatible storage (e.g. Backblaze B2).

## Project structure

```
src/
  lib/
    atproto/
      agent.ts              # OAuth client, signIn, session helpers
      lexicons/
        song.ts             # app.khord.song types
        vote.ts             # app.khord.vote types
        setlist.ts          # app.khord.setlist types
      social.ts             # fetchSongs, fetchSetlists, createSetlist, updateSetlist, etc.
    odesli/
      client.ts             # resolveUrl(), extractPlatformUrls()
    server/
      db.ts                 # SQLite connections (server-only)
      spotify.ts            # Spotify client credentials token + search
      access.ts             # ALLOWED_DIDS + MAX_USERS enforcement
    itunes/
      client.ts             # iTunes Search API
    components/
      ShareSongModal.svelte # Song search → resolve → AT Protocol record create
      CreateSetlistModal.svelte # Setlist creation with song search
      SongCard.svelte       # Feed card: platform links, upnote, post-to-feed
      SongSearch.svelte     # iTunes-backed search input
    stores/
      auth.ts               # session, isLoggedIn, authReady
      votes.ts              # upvotes, like/unlike
      shareSong.ts          # share modal state
      createSetlist.ts      # create setlist modal state
      following.ts          # followed users
      prefs.ts              # localStorage preferred platform
      instance.ts           # instanceConfig (albumArtDisabled)
  routes/
    +layout.svelte          # shell, desktop + mobile nav, footer, modals
    +page.svelte            # Feed / Daily / Setlists tabs
    setlists/[handle]/[rkey]/  # Setlist detail: drag reorder, share, edit
    login/+page.svelte      # AT Protocol OAuth login
    oauth/callback/         # OAuth redirect callback
    settings/               # Preferred streaming service
    api/
      resolve/              # Odesli proxy + Spotify augmentation
      feed/                 # AppView feed query (SQLite)
      votes/                # AppView votes query (SQLite)
      thumbnail/            # Image proxy (avoids CORS on third-party CDNs)
      auth/check/           # Access control check + user registration
      auth/status/          # Instance config endpoint
indexer/
  index.js                  # AT Protocol firehose subscriber
  schema.sql                # SQLite schema
  Dockerfile
lexicons/
  app.khord.song.json
  app.khord.vote.json
  app.khord.setlist.json
```

## Roadmap

- [x] AT Protocol OAuth + identity
- [x] Song sharing (`app.khord.song` records)
- [x] Feed — songs from followed users, AppView → PDS fallback
- [x] Voting (`app.khord.vote` records)
- [x] Platform links — preferred service, brand colors, More dropdown
- [x] song.link attribution
- [x] Album art (Odesli thumbnails)
- [x] Notes on shared songs
- [x] Post to Bluesky — link facets + album art embed
- [x] Setlists (`app.khord.setlist`) — create, reorder, share
- [x] Daily setlist view
- [x] Instance configuration (name, access control, etc.)
- [x] Docker Compose deployment
- [ ] AppView vote counts in feed UI
- [ ] YouTube Music resolution
- [ ] Setlist collaboration (proposal pattern)
- [ ] Capacitor wrapper for iOS/Android

## License

Khord is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) for details.

Third-party API attributions are listed in [NOTICE](NOTICE).
