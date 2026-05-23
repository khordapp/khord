declare global {
	namespace App {
		interface Locals {
			user: {
				id: number;
				username: string;
				email: string;
				displayName: string | null;
				role: string;
				hasAvatar: boolean;
			} | null;
		}
	}
}

export {};
