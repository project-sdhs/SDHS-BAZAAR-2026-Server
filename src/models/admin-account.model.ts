export type AdminRole = 'admin' | 'teacher' | 'class_leader';

export interface AdminAccount {
  id: number;
  email: string;
  name: string | null;
  role: AdminRole;
  scopeAll: boolean;
  canReviewPayments: boolean;
  canReviewCharges: boolean;
  userId: number | null;
  disabledAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
