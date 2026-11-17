/** 관리 기록 action (migrations/023_create_audit_logs.sql 의 CHECK 와 같아야 해요) */
export const AUDIT_ACTIONS = [
  'member.override',
  'member.verify',
  'member.class_leader_update',
  'booth.cashier_update',
  'google_group.create',
  'google_group.update',
  'google_group.delete',
  'google_sync.run',
  'user.delete',
  'credit.adjust',
  'charge.approve',
  'charge.reject',
  'charge.auto_approve',
  'charge.needs_review',
  'deposit.import',
  'payment.refund',
  'settings.update',
  'booth.create',
  'booth.update',
  'booth.image_update',
  'booth.qr_reissue',
  'booth.ordering_pause',
  'booth.ordering_resume',
  'menu.create',
  'menu.update',
  'menu.delete',
  'menu.image_update',
  'menu.reorder',
  'menu.sale_update',
  'admin_account.create',
  'admin_account.update',
  'admin_account.delete',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** 작업 대상 표 이름 (023 마이그레이션의 CHECK 와 같아야 해요) */
export const AUDIT_TARGET_TYPES = [
  'users',
  'school_members',
  'google_groups',
  'google_group_sync_runs',
  'booths',
  'booth_cashiers',
  'menus',
  'charge_requests',
  'payments',
  'credit_ledger_entries',
  'bazaar_settings',
  'admin_accounts',
  'deposit_imports',
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/** 작업 당시 역할 */
export type AuditActorRole =
  'admin' | 'teacher' | 'class_leader' | 'cashier' | 'student' | 'system';

/**
 * 누가 했는지.
 * - 백오피스 관리자 계정 → admin_account (adminId 필수)
 * - 앱 회원 → user (userId 필수)
 * - 서버가 자동으로 → system (자동 승인 · 동기화 등)
 */
export type AuditActor =
  | { type: 'admin_account'; adminId: number; role: Exclude<AuditActorRole, 'system'> }
  | { type: 'user'; userId: number; role: Exclude<AuditActorRole, 'system'> }
  | { type: 'system' };

/** 관리 기록을 남길 때 넘기는 값 */
export interface AuditLogInput {
  actor: AuditActor;
  action: AuditAction;
  /** 무엇을 바꿨는지 (예: { type: 'users', id: 1042 }) */
  target?: { type: AuditTargetType; id: number } | undefined;
  /** 부스와 관련된 작업이면 부스 id (부스 운영 화면에서 모아 보려고) */
  boothId?: number | undefined;
  /** 바꾸기 전 값 · 바꾼 뒤 값 (JSON 으로 저장해요) */
  before?: unknown;
  after?: unknown;
  /** 사유 (200자까지, 넘으면 잘라서 저장해요) */
  reason?: string | undefined;
  /** 요청 ID (req.id). 서버 로그와 연결할 때 써요. */
  requestId?: string | undefined;
}

/** DB에 저장된 관리 기록 */
export interface AuditLog {
  id: number;
  actorType: AuditActor['type'];
  actorAdminId: number | null;
  actorUserId: number | null;
  actorRole: AuditActorRole;
  action: AuditAction;
  targetType: AuditTargetType | null;
  targetId: number | null;
  boothId: number | null;
  beforeValue: unknown;
  afterValue: unknown;
  reason: string | null;
  requestId: string | null;
  createdAt: string;
}
