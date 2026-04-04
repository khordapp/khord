export const VOTE_NSID = 'app.khord.vote';

export type VoteDirection = 'up' | 'down';

export interface KhordVoteRecord {
	subject: {
		uri: string;
		cid: string;
	};
	direction: VoteDirection;
	createdAt: string;
}

export interface KhordVote {
	uri: string;
	cid: string;
	value: KhordVoteRecord;
}
