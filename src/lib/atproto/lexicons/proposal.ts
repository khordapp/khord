export const PROPOSAL_NSID = 'app.khord.setlist.proposal';

export interface KhordProposalSnapshot {
	title: string;
	artist: string;
	album?: string;
	thumbnailUrl?: string;
	spotifyUrl?: string;
	appleMusicUrl?: string;
	youtubeMusicUrl?: string;
	tidalUrl?: string;
	deezerUrl?: string;
	amazonMusicUrl?: string;
	soundcloudUrl?: string;
	songlinkUrl?: string;
}

export interface KhordProposalRecord {
	setlistUri: string;
	setlistCid: string;
	snapshot: KhordProposalSnapshot;
	note?: string;
	createdAt: string;
}

export interface KhordProposal {
	uri: string;
	cid: string;
	proposerDid: string;
	proposerHandle?: string;
	proposerAvatar?: string;
	value: KhordProposalRecord;
}
