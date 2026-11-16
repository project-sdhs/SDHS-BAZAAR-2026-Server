export interface GoogleGroup {
  id: number;
  groupEmail: string;
  groupType: 'class' | 'teacher';
  classId: number | null;
  displayName: string | null;
  createdByAdminId: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
