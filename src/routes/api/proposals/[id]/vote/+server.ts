// POST /api/proposals/[id]/vote — upvote a proposal
// DELETE /api/proposals/[id]/vote — remove upvote
// Only allowed when the setlist is open (challenge mode); proposal must be pending.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { getParamId } from '$lib/server/utils';

function getProposalAndSetlist(proposalId: number) {
	const db = getDb();
	return db.prepare(`
		SELECT p.id, p.status, sl.open, sl.user_id as setlist_owner_id
		FROM proposals p
		JOIN setlists sl ON sl.id = p.setlist_id
		WHERE p.id = ?
	`).get(proposalId) as { id: number; status: string; open: number; setlist_owner_id: number } | undefined;
}

function getVoteCount(db: import('better-sqlite3').Database, proposalId: number): number {
	const row = db.prepare('SELECT COUNT(*) as c FROM proposal_votes WHERE proposal_id = ?').get(proposalId) as { c: number };
	return row.c;
}

export const POST: RequestHandler = ({ params, locals }) => {
	const user = requireAuth(locals.user);
	const id = getParamId(params.id);

	const proposal = getProposalAndSetlist(id);
	if (!proposal) error(404, 'Proposal not found');
	if (proposal.status !== 'pending') error(400, 'Cannot vote on a resolved proposal');
	if (proposal.open !== 1) error(403, 'Voting is only available on open challenge mixtapes');

	const db = getDb();
	try {
		db.prepare('INSERT INTO proposal_votes (proposal_id, user_id) VALUES (?, ?)').run(id, user.id);
	} catch {
		// UNIQUE constraint — already voted, treat as success
	}

	return json({ voted: true, voteCount: getVoteCount(db, id) });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
	const user = requireAuth(locals.user);
	const id = getParamId(params.id);

	const proposal = getProposalAndSetlist(id);
	if (!proposal) error(404, 'Proposal not found');

	const db = getDb();
	db.prepare('DELETE FROM proposal_votes WHERE proposal_id = ? AND user_id = ?').run(id, user.id);

	return json({ voted: false, voteCount: getVoteCount(db, id) });
};
