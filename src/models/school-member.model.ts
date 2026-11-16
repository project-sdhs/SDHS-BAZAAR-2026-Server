export type SchoolMemberType = 'student' | 'teacher';

export type SchoolMemberSource = 'google_sync' | 'manual';

export interface SchoolMember {
  id: number;
  email: string;
  name: string | null;
  memberType: SchoolMemberType;
  classId: number | null;
  studentNo: string | null;
  isClassLeader: boolean;
  source: SchoolMemberSource;
  googleGroupId: number | null;
  lastSyncRunId: number | null;
  overriddenByAdminId: number | null;
  overriddenAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
