# Khord Instance Admin Guide

Everything an instance owner needs to deploy and manage a Khord instance.

## Contents

- [Deployment](#deployment)
  - [Docker Compose (VPS)](#docker-compose-vps)
  - [Unraid](#unraid)
- [Environment variables](#environment-variables)
- [Admin panel](#admin-panel)
  - [Users](#users)
  - [Bans](#bans)
  - [Requests](#requests)
  - [Settings](#settings)
  - [Cache](#cache)
- [Streaming integrations](#streaming-integrations)
  - [Spotify](#spotify)
  - [YouTube Music](#youtube-music)
  - [Apple Music playlist import](#apple-music-playlist-import)
- [Themes](#themes)
- [Access control](#access-control)
- [Backup](#backup)

---

## Deployment

### Docker Compose (VPS)

A single `docker-compose.yml` runs the app, firehose indexer, and Caddy (HTTPS + reverse proxy) together.

**Minimum specs:** 1 vCPU, 512 MB RAM, 5 GB disk. A Hetzner CX22 (~€4/mo) handles hundreds of active users comfortably.

```bash
git clone https://github.com/khordapp/khord && cd khord
cp .env.example .env
# Fill in at minimum: PUBLIC_APP_URL, OWNER_DIDS
docker compose up -d
```

Edit `Caddyfile` to replace `khord.app` with your domain before starting — Caddy handles TLS automatically.

AT Protocol OAuth requires a publicly accessible HTTPS URL. The app won't work on plain HTTP or `localhost`.

### Unraid

Install both containers from Community Applications (search **Khord**):

1. Install **khord-indexer** first — set Data Path to `/mnt/user/appdata/khord/data`
2. Install **khord** — set the **same** Data Path so both containers share the SQLite database
3. Point your Unraid reverse proxy (NGINX Proxy Manager, Swag, Traefik) at **khord** on port **3000** with HTTPS
4. Set `PUBLIC_APP_URL` to your public HTTPS URL

Both containers must use the exact same Data Path — they read and write the same `khord.db` file.

---

## Environment variables

All variables can be set in `.env` (Docker Compose) or the Unraid template. Variables marked **DB override** can also be updated live from the admin panel without a restart.

### Required

| Variable | Description |
|---|---|
| `PUBLIC_APP_URL` | Publicly accessible HTTPS URL, e.g. `https://khord.yourdomain.com`. Must match the AT Protocol OAuth redirect URI. |
| `OWNER_DIDS` | Comma-separated AT Protocol DIDs with admin privileges. Find yours at `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=your.handle` |

### Branding

| Variable | Default | Description |
|---|---|---|
| `PUBLIC_APP_NAME` | `Khord` | Display name in the UI and page titles |
| `PUBLIC_APP_TAGLINE` | `Music, across every platform.` | One-line tagline on the home page |
| `PUBLIC_AUTH_PROVIDER_NAME` | `Bluesky` | Identity provider name shown in sign-in copy |
| `PUBLIC_THEME` | `dark` | UI color theme — see [Themes](#themes). Requires a container restart. |

### Streaming integrations

| Variable | Description |
|---|---|
| `PUBLIC_SPOTIFY_CLIENT_ID` | Spotify app client ID — from [developer.spotify.com](https://developer.spotify.com/dashboard). Enable in admin panel after setting. |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret — keep private. |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key — from [console.cloud.google.com](https://console.cloud.google.com). Enable in admin panel after setting. |
| `PUBLIC_APPLE_MUSIC_DEV_TOKEN` | MusicKit JWT — from [developer.apple.com](https://developer.apple.com). Can also be entered via the admin panel. Enable in admin panel after setting. |

iTunes search (Apple Music track links, song discovery) works without any credentials.

Deezer search and track links work without any credentials.

### Access control

| Variable | Description |
|---|---|
| `ALLOWED_DIDS` | Comma-separated DIDs allowed to sign in. Leave unset for open registration. |
| `BANNED_DIDS` | Comma-separated DIDs blocked from signing in. Requires a restart. For live bans use the admin panel instead. |
| `MAX_USERS` | Maximum registered users. `0` = unlimited. **DB override** — adjustable live from admin panel. |

### Storage

| Variable | Default | Description |
|---|---|---|
| `INDEXER_DB_NAME` | `khord.db` | **Unraid only** — database file name inside the Data Path directory. Must match between the app and indexer containers. |
| `INDEXER_DB_PATH` | `/data/khord.db` | **Docker Compose** — full path to the SQLite database. Ignored when `INDEXER_DB_NAME` is set. |
| `THUMBNAIL_CACHE_DIR` | `/data/thumbnails` | Directory for the server-side album art disk cache. Managed from admin panel. |

### Misc

| Variable | Default | Description |
|---|---|---|
| `DISABLE_ALBUM_ART` | `false` | Hide album art thumbnails on song cards. **DB override** — toggleable live from admin panel. |
| `FIREHOSE_RELAY` | `wss://bsky.network` | AT Protocol firehose relay URL. Rarely needs changing. |

---

## Admin panel

Access the admin panel at `/admin`. Only DIDs listed in `OWNER_DIDS` can enter.

### Users

Paginated list of all registered users — AT Protocol DID, handle, display name, and registration date. Useful for seeing who's on your instance.

### Bans

Add and remove banned DIDs. Banned users are immediately blocked from signing in — no restart needed. You can ban by DID (paste directly) or by clicking Ban from the Users tab.

### Requests

Only visible when **invite-only** mode is on. Shows pending access requests submitted by users who tried to sign in. Approve to register them; decline to reject. Approved users are immediately able to sign in.

### Settings

All toggles and settings take effect immediately and persist across restarts (stored in SQLite, not env vars).

| Setting | Default | Description |
|---|---|---|
| Album art | On | Show thumbnail images on song cards. Disable if the iTunes CDN becomes unreliable. |
| Open registration | On | Allow new users to sign up. Turning this off prevents new sign-ins without affecting existing users. |
| Invite-only | Off | New users must request access via the Requests tab before being registered. Existing users are unaffected. |
| Instance-scoped feed | Off | Only show songs shared from this instance. Songs from other Khord instances won't appear even if a followed user shared from one. |
| Spotify links | On | Resolve Spotify URLs when sharing songs. Requires `PUBLIC_SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`. |
| YouTube Music links | Off | Resolve YouTube Music URLs when sharing songs. Requires `YOUTUBE_API_KEY`. Uses ~100 YouTube Data API quota units per song shared (free quota: ~100 songs/day). |
| Apple Music playlist import | Off | Let users import playlists from Apple Music. Requires a MusicKit developer token — see [Apple Music playlist import](#apple-music-playlist-import). |
| Developer token (Apple Music) | — | Paste your MusicKit JWT here. Updates take effect immediately; no restart needed. Leave blank to use the `PUBLIC_APPLE_MUSIC_DEV_TOKEN` env var if set. |
| User cap | 0 (unlimited) | Maximum number of registered users. New sign-in attempts are rejected once reached. |

### Cache

Manage the server-side album art disk cache. Shows current cache size and lets you clear it. Cache entries are created lazily when album art is first viewed; entries are reused across requests with 24-hour HTTP cache headers.

---

## Streaming integrations

### Spotify

Enables Spotify URLs on shared songs and Spotify playlist import.

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   - The account that owns the app must have an **active Spotify Premium subscription**
   - Add your `PUBLIC_APP_URL` as an allowed redirect URI (required for the app to be approved)
2. Copy the **Client ID** and **Client Secret**
3. Set `PUBLIC_SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in your `.env` or Unraid template
4. Restart the container
5. Go to **Admin → Settings** and enable **Spotify links**

### YouTube Music

Enables YouTube Music URLs on shared songs and YouTube playlist import.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Enable APIs
2. Enable the **YouTube Data API v3**
3. Create an API key (Credentials → Create Credentials → API Key)
4. Restrict the key to the YouTube Data API v3
5. Set `YOUTUBE_API_KEY` in your `.env` or Unraid template
6. Restart the container
7. Go to **Admin → Settings** and enable **YouTube Music links**

**Quota note:** The free YouTube Data API quota is 10,000 units/day. A single song resolution costs ~100 units, so the free tier supports roughly 100 songs/day. If your instance is high-traffic, monitor usage in Google Cloud Console.

### Apple Music playlist import

Lets users paste an Apple Music playlist URL to import all tracks at once.

**Prerequisite:** An Apple Developer account ($99/yr). iTunes search and individual Apple Music song links work without it — this only affects playlist import.

1. Enroll at [developer.apple.com](https://developer.apple.com)
2. Go to **Certificates, Identifiers & Profiles → Keys**
3. Create a new key — enable **MusicKit**
4. Download the `.p8` private key file (you can only download it once)
5. Note your **Team ID** (top-right of the developer portal) and **Key ID** (shown in the key list)
6. Generate a JWT developer token:

```bash
# Using Ruby (ruby-jwt gem) — one-time setup:
gem install jwt

ruby - <<'EOF'
require 'jwt'
require 'openssl'

key_id   = 'YOUR_KEY_ID'
team_id  = 'YOUR_TEAM_ID'
key_file = '/path/to/AuthKey_KEYID.p8'

private_key = OpenSSL::PKey::EC.new(File.read(key_file))
payload = {
  iss: team_id,
  iat: Time.now.to_i,
  exp: Time.now.to_i + 15_552_000  # 6 months
}
headers = { kid: key_id }
puts JWT.encode(payload, private_key, 'ES256', headers)
EOF
```

Or use any JWT library that supports ES256 — the payload fields are `iss` (Team ID), `iat` (issued at), `exp` (expiry, max 6 months from `iat`), and the header needs `kid` (Key ID) and `alg: ES256`.

7. Go to **Admin → Settings**, paste the JWT into **Developer token**, and enable **Apple Music playlist import**
8. Tap **Save settings**

**Token expiry:** Tokens are valid for up to 6 months. Set a calendar reminder to regenerate before expiry — expired tokens will silently break playlist import. You can update the token in the admin panel at any time without restarting the container.

**Future:** Once the developer token is configured, setlist export from Khord to Apple Music becomes feasible. Export requires MusicKit JS user authorization (each user grants access to their library) in addition to the developer token — the infrastructure is in place, the feature is on the roadmap.

---

## Themes

Set via the `PUBLIC_THEME` env var. Requires a container restart to apply. The theme affects the entire instance — users cannot override it.

| Category | Values |
|---|---|
| Neutral dark | `dark` (default), `zinc`, `slate`, `gray`, `neutral`, `stone` |
| Neutral light | `light`, `zinc-light`, `slate-light`, `neutral-light`, `stone-light` |
| Chromatic dark | `navy`, `teal`, `emerald`, `rose`, `violet` |

To add a custom theme: create `src/lib/theme/mytheme.ts` implementing the `Theme` interface, register it in `src/lib/theme/index.ts`, and rebuild the image.

---

## Access control

Three modes — mix and match:

**Open (default):** Anyone with an AT Protocol identity (Bluesky account or self-hosted PDS) can sign in.

**Allowlist (`ALLOWED_DIDS`):** Only the DIDs you list can sign in. Everyone else is rejected at the OAuth callback.

**Invite-only (admin panel toggle):** Anyone can try to sign in, but new users are placed in a pending queue. You approve or decline them individually from the admin Requests tab. Existing registered users are not affected when you enable this.

**Bans:** Individual DIDs can be banned regardless of mode. The admin panel ban list takes effect immediately — no restart needed.

**User cap (`MAX_USERS`):** Hard limit on total registered users. New sign-in attempts are rejected once reached. Adjustable live from admin panel Settings.

You can combine these — for example, invite-only + user cap enforces both a review step and a hard ceiling.

---

## Backup

The entire state of your Khord instance lives in two places:

1. **`khord.db`** — the SQLite database. Contains the AppView index (songs, votes, proposals), registered users, bans, and instance settings. Back this up regularly.
2. **`thumbnails/`** — the album art disk cache. Expendable — entries rebuild on demand from iTunes CDN. You can skip backing this up.

AT Protocol records (songs, votes, setlists) are also stored on each user's PDS — so they're not lost even if your database is wiped. The indexer will re-index them from the firehose over time, or you can trigger a backfill from the admin panel once that feature ships.

**Simple backup with SQLite:**
```bash
# Safe online backup — no downtime needed
sqlite3 /data/khord.db ".backup /backup/khord-$(date +%Y%m%d).db"
```

Run this from a cron job or your backup tool of choice.
