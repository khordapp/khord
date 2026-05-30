import type { PlatformKey } from '$lib/stores/prefs';

export const PLATFORMS: { key: PlatformKey; label: string; color: string }[] = [
	{ key: 'appleMusicUrl',   label: 'Apple Music',   color: '#FC3C44' },
	{ key: 'spotifyUrl',      label: 'Spotify',       color: '#1DB954' },
	{ key: 'youtubeMusicUrl', label: 'YouTube Music', color: '#FF0000' },
	{ key: 'deezerUrl',       label: 'Deezer',        color: '#EF5466' },
];

export const STORAGE_KEYS = {
	SPOTIFY_PENDING_EXPORT: 'khord_spotify_pending_export',
	spotifyExport: (id: number) => `khord_spotify_export_${id}`,
} as const;
