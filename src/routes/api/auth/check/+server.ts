// POST /api/auth/check
// Called after OAuth completes with the authenticated DID.
// Validates against ALLOWED_DIDS and MAX_USERS, then registers the user.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAndRegister } from '$lib/server/access';

export const POST: RequestHandler = async ({ request }) => {
	const { did } = await request.json();
	if (!did || typeof did !== 'string') error(400, 'Missing did');

	const result = checkAndRegister(did);
	return json(result);
};
