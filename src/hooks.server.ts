import { env } from '$env/dynamic/private';
import { getDbRw } from '$lib/server/db';

// Ensure owner DIDs are always registered on startup so admins are never
// locked out after a reset or on a fresh install.
const ownerDids = (env.OWNER_DIDS ?? '').split(',').map((d) => d.trim()).filter(Boolean);
if (ownerDids.length > 0) {
	const db = getDbRw();
	if (db) {
		for (const did of ownerDids) {
			db.prepare('INSERT INTO registered_users(did) VALUES(?) ON CONFLICT(did) DO NOTHING').run(did);
		}
	}
}
