# Deploying Khord

Docker Compose handles the full stack — SvelteKit app and Caddy reverse proxy with automatic HTTPS.

## Architecture

```
Caddy (HTTPS, auto TLS)  ← ports 80/443
  └── SvelteKit app (port 3000)
       └── SQLite /data/khord.db  ← Docker volume
```

The entire state of a Khord instance lives in a single SQLite database.

## VPS

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
git clone https://github.com/khordapp/khord && cd khord
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

## Unraid

The **khord** container is available in the Unraid **Community Applications** store. Search for "khord" and install it. Point your existing Unraid reverse proxy at port 3000.

### Reverse proxy

Unraid users typically already have NGINX Proxy Manager, Swag, or Traefik handling TLS. Add a proxy host pointing your domain at the khord container on port 3000:

- **NGINX Proxy Manager / Swag:** proxy host `yourdomain.com` → `http://khord:3000` (container name on the Docker bridge), or `http://unraid-ip:3000` if the port is exposed to the host.
- **Traefik:** add the standard labels to route `yourdomain.com` to the `khord` container on port 3000.

### Backups

```bash
# Safe to run live — SQLite WAL mode
docker exec khord sqlite3 /data/khord.db ".backup /data/khord.backup.db"
```

Or configure [Litestream](https://litestream.io/) to stream WAL changes to a local path or S3-compatible storage (e.g. Backblaze B2).

## Environment variables

| Variable | Description |
|---|---|
| `PUBLIC_APP_URL` | Publicly accessible URL (e.g. `https://khord.example.com`) |
| `PUBLIC_APP_NAME` | Display name in UI and page titles (default: `Khord`) |
| `PUBLIC_APP_TAGLINE` | Tagline on the home page (default: `Share music, listen anywhere.`) |
| `PUBLIC_THEME` | UI color theme — see [Themes](#themes) (default: `dark`) |
| `PUBLIC_SPOTIFY_CLIENT_ID` | Spotify app client ID — from developer.spotify.com |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret — server-only |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key — enables YouTube Music links; toggle per instance in admin settings. Free quota is ~100 songs/day. |
| `OWNER_EMAILS` | Comma-separated email addresses with admin/owner privileges (ban management, admin panel access) |
| `DISABLE_ALBUM_ART` | Set to `true` to hide album art thumbnails globally |
| `INDEXER_DB_PATH` | Full path to the SQLite database (default: `/data/khord.db`). For Unraid, use `INDEXER_DB_NAME` instead — see the Unraid section. |

See `.env.example` for full documentation and defaults.

## Themes

Set `PUBLIC_THEME` in `.env`. A rebuild is required when changing this value.

| Category | Values |
|---|---|
| Neutral dark | `dark` (default), `zinc`, `slate`, `gray`, `neutral`, `stone` |
| Neutral light | `light`, `zinc-light`, `slate-light`, `neutral-light`, `stone-light` |
| Chromatic dark | `navy`, `teal`, `emerald`, `rose`, `violet` |

Each theme includes a `heroGradient` token — a complementary gradient bloom used on the logged-out landing hero.

To add a custom theme: implement the `Theme` interface in `src/lib/theme/`, then register it in `src/lib/theme/index.ts`.
