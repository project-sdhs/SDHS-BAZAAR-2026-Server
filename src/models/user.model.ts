export type AuthProvider = 'google' | 'kakao' | 'apple';

export interface User {
  id: number;
  authProvider: AuthProvider;
  authSubject: string;
  email: string | null;
  googleHostedDomain: string | null;
  name: string | null;
  schoolMemberId: number | null;
  verifiedAt: string | null;
  verifiedByUserId: number | null;
  verifiedByAdminId: number | null;
  depositCode: string | null;
  creditBalance: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
