import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import { songSlug, setlistSlug } from '$lib/slug';

export const load: PageServerLoad = ({ params, locals, url }) => {
	const db = getDb();

	const user = db.prepare(`
		SELECT id, username, display_name, profile_public, created_at,
		       avatar IS NOT NULL as has_avatar
		FROM users WHERE username = ? COLLATE NOCASE
	`).get(params.username) as any;

	if (!user) error(404, 'User not found');

	const actualIsOwnProfile = locals.user?.id === user.id;
	const previewMode = actualIsOwnProfile && url.searchParams.has('preview');
	const viewerLoggedIn = previewMode ? false : !!locals.user;
	const isOwnProfile = previewMode ? false : actualIsOwnProfile;

	const profile = {
		id:            user.id,
		username:      user.username,
		displayName:   user.display_name ?? null,
		hasAvatar:     !!user.has_avatar,
		profilePublic: !!user.profile_public,
		createdAt:     user.created_at,
	};

	// Private profile — only CTA for logged-out visitors
	if (!user.profile_public && !viewerLoggedIn) {
		return { profile, stats: null, recentSongs: [], recentSetlists: [], viewerLoggedIn, isOwnProfile };
	}

	// Public or basic-only view for logged-out
	if (!viewerLoggedIn) {
		return { profile, stats: null, recentSongs: [], recentSetlists: [], viewerLoggedIn, isOwnProfile };
	}

	// Full profile for logged-in viewers
	const stats = db.prepare(`
		SELECT
			(SELECT COUNT(*) FROM songs    WHERE user_id = ? AND listed != 0) as song_count,
			(SELECT COUNT(*) FROM setlists WHERE user_id = ?)                 as setlist_count
	`).get(user.id, user.id) as any;

	const songRows = db.prepare(`
		SELECT id, title, artist, album, thumbnail_url, note, created_at
		FROM songs WHERE user_id = ? AND listed != 0
		ORDER BY created_at DESC LIMIT 10
	`).all(user.id) as any[];

	const setlistRows = db.prepare(`
		SELECT id, title, description, created_at
		FROM setlists WHERE user_id = ?
		ORDER BY created_at DESC LIMIT 5
	`).all(user.id) as any[];

	return {
		profile,
		stats: { songCount: stats.song_count as number, setlistCount: stats.setlist_count as number },
		recentSongs: songRows.map((r) => ({
			id:          r.id as number,
			title:       r.title as string,
			artist:      r.artist as string,
			album:       r.album ?? undefined,
			thumbnailUrl: r.thumbnail_url ?? undefined,
			note:        r.note ?? undefined,
			createdAt:   r.created_at as string,
			slug:        songSlug(r.title, r.artist, r.id),
		})),
		recentSetlists: setlistRows.map((r) => ({
			id:          r.id as number,
			title:       r.title as string,
			description: r.description ?? undefined,
			createdAt:   r.created_at as string,
			slug:        setlistSlug(r.title, r.id),
		})),
		viewerLoggedIn,
		isOwnProfile,
	};
};
