import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE, deleteSession, cookieOptions } from '$lib/server/auth';

export const POST: RequestHandler = ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) deleteSession(token);
	cookies.set(SESSION_COOKIE, '', { ...cookieOptions(0) });
	return json({ ok: true });
};
