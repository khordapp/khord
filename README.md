# Khord

**Share music, listen anywhere.**

Khord is a decentralized social app for sharing music. Share a song once — your followers listen on whichever streaming service they use. Spotify, Apple Music, Tidal, and more. Artist revenue flows naturally because playback happens natively in each platform.

Identity and records live on the [AT Protocol](https://atproto.com/). No central Khord database — your shares, votes, and setlists are yours.

> **Vibe coded with [Claude](https://claude.ai/claude-code)** — this project was built collaboratively with Claude Code (Anthropic). Architecture decisions, feature design, and implementation were a human+AI pair programming effort.

---

## Features

### For users

- **Song sharing** — search for any song, share it with an optional note; album art and cross-platform links resolved automatically
- **Cross-platform links** — your preferred streaming service shown first; no in-app playback, songs open natively in each platform
- **Feed** — songs from people you follow, plus an instance-wide All Songs view
- **Daily view** — browse shares by date; create a setlist from an entire day in one click
- **Setlists** — curated, ordered playlists; drag to reorder; shareable via link; propose songs to others' setlists
- **Upnotes** — lightweight reactions on any shared song
- **Post to Bluesky** — cross-post any song with album art embed and an optional personal note

### For instance owners

- **18 themes** — neutral and chromatic, dark and light variants; set via `PUBLIC_THEME`
- **Customizable landing page** — edit `src/lib/landing.svelte` to add community-specific copy and imagery
- **Instance configuration** — app name, tagline, identity provider, and access control via env vars
- **Admin panel** — manage users, bans, access requests, and instance settings at `/admin`
- **Streaming integrations** — enable Spotify, YouTube Music, and Apple Music playlist import via the admin panel; Deezer and iTunes always-on
- **Access control** — open registration, invite-only, allowlist, or user cap; mix and match
- **Playlist import** — users can paste a Spotify, YouTube Music, Deezer, or Apple Music playlist URL to import all tracks at once

## Stack

- [SvelteKit](https://kit.svelte.dev/) + TypeScript + TailwindCSS
- [@atproto/api](https://github.com/bluesky-social/atproto) — user identity, AT Protocol OAuth, record storage
- iTunes Search API — free song discovery and Apple Music track links (no auth)
- [Spotify Web API](https://developer.spotify.com/) — client credentials search + playlist fetch (optional)
- Deezer API — track search and playlist fetch (no credentials, always-on)
- YouTube Data API v3 — YouTube Music links + playlist fetch (optional)
- Apple Music catalog API — playlist import via MusicKit developer token (optional)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — optional AppView index; falls back to direct PDS fetch
- [svelte-dnd-action](https://github.com/isaacHagoel/svelte-dnd-action) — drag-to-reorder for setlists

## How it works

1. User searches for a song (iTunes API) and selects a result; iTunes provides the Apple Music URL and artwork
2. Server resolves cross-platform links in parallel — Spotify, Deezer, and YouTube Music searched directly
3. `app.khord.song` record written to user's AT Protocol PDS with all resolved platform URLs
4. Feed assembled from SQLite AppView (if running) or direct PDS fetches (fallback)
5. Listeners open songs in their preferred platform — no in-app playback

## Getting started

```bash
npm install
cp .env.example .env   # fill in values
npm run dev            # http://localhost:5173
```

See [docs/contributing.md](docs/contributing.md) for full dev setup, tunnel configuration, and project structure.

## Deploying

Docker Compose + Caddy on a VPS, or install both containers directly from Unraid Community Applications.

See [docs/deploying.md](docs/deploying.md) for step-by-step instructions.

## Managing your instance

See [docs/admin.md](docs/admin.md) for the full admin guide — streaming integrations (Spotify, YouTube Music, Apple Music), themes, access control, admin panel reference, and backup.

## Roadmap

- [x] AT Protocol identity and OAuth
- [x] Song sharing with cross-platform links (Spotify, Apple Music, YouTube Music, Deezer, and more)
- [x] Feed — following feed and instance-wide view; upnotes; SQLite AppView index
- [x] Post to Bluesky with album art embed
- [x] Setlists — create, reorder, collaborate via proposals, daily view
- [x] Instance management — 18 themes, access control, admin panel, Docker/Unraid deployment
- [x] Playlist import — Spotify, YouTube Music, Deezer, Apple Music (requires MusicKit token)
- [ ] Setlist export to streaming services (Spotify first; Apple Music feasible once MusicKit token is configured)
- [ ] Mobile apps (iOS/Android via Capacitor)

## Questions

Open an issue or email [dev@khord.app](mailto:dev@khord.app).

## License

Khord is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) for details.

Third-party API attributions are listed in [NOTICE](NOTICE).
