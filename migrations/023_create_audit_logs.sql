
-- DB-09: 관리 기록 테이블 생성

CREATE TABLE audit_logs (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 누가 작업했는지
    actor_type VARCHAR(20) NOT NULL
        CHECK (actor_type IN (
            'admin_account', 'user', 'system'
        )),

    actor_admin_id BIGINT UNSIGNED NULL,
    actor_user_id BIGINT UNSIGNED NULL,

    -- 작업 당시 역할
    actor_role VARCHAR(20) NOT NULL
        CHECK (actor_role IN (
            'admin', 'teacher', 'class_leader',
            'cashier', 'student', 'system'
        )),

    -- 어떤 작업을 수행했는지
    action VARCHAR(40) NOT NULL
        CHECK (action IN (
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
            'admin_account.delete'
        )),

    -- 작업 대상
    target_type VARCHAR(30) NULL
        CHECK (target_type IN (
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
            'deposit_imports'
        )),

    target_id BIGINT UNSIGNED NULL,
    booth_id BIGINT UNSIGNED NULL,

    -- 변경 전후 데이터
    before_value JSON NULL,
    after_value JSON NULL,

    -- 사유와 요청 추적 ID
    reason VARCHAR(200) NULL,
    request_id VARCHAR(64) NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 외래 키 3개
    CONSTRAINT fk_audit_logs_actor_admin
        FOREIGN KEY (actor_admin_id)
        REFERENCES admin_accounts(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_audit_logs_actor_user
        FOREIGN KEY (actor_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_audit_logs_booth
        FOREIGN KEY (booth_id)
        REFERENCES booths(id)
        ON DELETE RESTRICT
);
