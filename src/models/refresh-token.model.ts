export type RefreshTokenPlatform = 'ios' | 'android' | 'web';

export type RefreshTokenRevokedReason = 'rotated' | 'logout' | 'reuse_detected' | 'account_deleted';

export interface RefreshToken {
  id: number;
  userId: number;
  tokenHash: string;
  platform: RefreshTokenPlatform | null;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: RefreshTokenRevokedReason | null;
  replacedById: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
