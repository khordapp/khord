# Khord

**Share music, listen anywhere.**

Khord is a self-hosted music sharing app. Share a song once — everyone listens on whichever streaming service they use. Spotify, Apple Music, YouTube Music, Deezer, and more. Artist revenue flows naturally because playback happens natively in each platform.

> **Vibe coded with [Claude](https://claude.ai/claude-code)** — this project was built collaboratively with Claude Code (Anthropic). Architecture decisions, feature design, and implementation were a human+AI pair programming effort.

---

## Features

### For users

- **Song sharing** — search for any song, share it with an optional note; album art and cross-platform links resolved automatically
- **Cross-platform links** — your preferred streaming service shown first; no in-app playback, songs open natively in each platform
- **Feed** — songs from everyone on the instance, plus a Daily view to browse shares by date
- **Daily view** — browse shares by date; create a setlist from an entire day in one click
- **Setlists** — curated, ordered playlists; drag to reorder; shareable via link; propose songs to others' setlists
- **Upnotes** — lightweight reactions on any shared song

### For instance owners

- **18 themes** — neutral and chromatic, dark and light variants; set via `PUBLIC_THEME`
- **Customizable landing page** — edit `src/lib/landing.svelte` to add community-specific copy and imagery
- **Instance configuration** — app name, tagline, and access control via env vars
- **Admin panel** — manage users, bans, access requests, and instance settings at `/admin`
- **Streaming integrations** — enable Spotify, YouTube Music, and Apple Music playlist import via the admin panel; Deezer and iTunes always-on
- **Access control** — open registration, invite-only, or user cap; mix and match
- **Playlist import** — users can paste a Spotify, YouTube Music, Deezer, or Apple Music playlist URL to import all tracks at once

## Stack

- [SvelteKit](https://kit.svelte.dev/) + TypeScript + TailwindCSS
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — all data stored in SQLite (songs, votes, setlists, users)
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js) — password hashing for email/password auth
- iTunes Search API — free song discovery and Apple Music track links (no auth)
- [Spotify Web API](https://developer.spotify.com/) — client credentials search + playlist fetch (optional)
- Deezer API — track search and playlist fetch (no credentials, always-on)
- YouTube Data API v3 — YouTube Music links + playlist fetch (optional)
- Apple Music catalog API — playlist import via MusicKit developer token (optional)
- [svelte-dnd-action](https://github.com/isaacHagoel/svelte-dnd-action) — drag-to-reorder for setlists

## How it works

1. User registers with an email address and password; session stored as a server-side cookie
2. User searches for a song (iTunes API) and selects a result; iTunes provides the Apple Music URL and artwork
3. Server resolves cross-platform links in parallel — Spotify, Deezer, and YouTube Music searched directly
4. Song written to SQLite with all resolved platform URLs; appears in the feed immediately
5. Listeners open songs in their preferred platform — no in-app playback

## Getting started

```bash
npm install
cp .env.example .env   # fill in values
npm run dev            # http://localhost:5173
```

See [docs/contributing.md](docs/contributing.md) for full dev setup, tunnel configuration, and project structure.

## Deploying

Docker Compose + Caddy on a VPS, or install the container directly from Unraid Community Applications.

See [docs/deploying.md](docs/deploying.md) for step-by-step instructions.

## Managing your instance

See [docs/admin.md](docs/admin.md) for the full admin guide — streaming integrations (Spotify, YouTube Music, Apple Music), themes, access control, admin panel reference, and backup.

## Roadmap

- [x] Email + password auth with server-side sessions
- [x] Song sharing with cross-platform links (Spotify, Apple Music, YouTube Music, Deezer, and more)
- [x] Feed — instance-wide view; upnotes; SQLite storage
- [x] Setlists — create, reorder, collaborate via proposals, daily view
- [x] Instance management — 18 themes, access control, admin panel, Docker/Unraid deployment
- [x] Playlist import — Spotify, YouTube Music, Deezer, Apple Music (requires MusicKit token)
- [x] Setlist export to Spotify
- [ ] Setlist export to Apple Music
- [ ] Android app (Capacitor — in internal testing; background notifications via 15-min polling, by design for self-hosted instances)
- [ ] iOS app (Capacitor — not started)

## Questions

Open an issue or email [dev@khord.app](mailto:dev@khord.app).

## License

Khord is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) for details.

Third-party API attributions are listed in [NOTICE](NOTICE).
