
-- DB-13: 사용자 크레딧 충전 요청 테이블

CREATE TABLE charge_requests (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 충전 요청 사용자
    user_id BIGINT UNSIGNED NOT NULL,

    -- 충전 안내 계좌
    deposit_account_id BIGINT UNSIGNED NOT NULL,

    -- 중복 충전 요청 방지 키
    idempotency_key CHAR(36) NOT NULL,

    -- 충전 요청 금액
    amount BIGINT NOT NULL
        CHECK (amount > 0),

    -- 충전 상태
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'approved',
                'rejected',
                'needs_review'
            )
        ),

    -- 요청 당시 입금자명
    depositor_name VARCHAR(40) NOT NULL,

    -- 정규화된 입금자명
    depositor_name_normalized VARCHAR(40) NOT NULL,

    -- 확인 필요 사유 코드
    review_reason_code VARCHAR(30) NULL
        CHECK (
            review_reason_code IN (
                'no_deposit_30m',
                'missing_identifier',
                'spacing_mismatch',
                'amount_mismatch',
                'multiple_matches'
            )
        ),

    -- 사용자에게 표시할 사유
    reason VARCHAR(200) NULL,

    -- 관리자 메모
    memo VARCHAR(200) NULL,

    -- 추천된 은행 입금 내역
    suggested_bank_deposit_id BIGINT UNSIGNED NULL,

    -- 실제 연결된 은행 입금 내역
    bank_deposit_id BIGINT UNSIGNED NULL,

    -- 승인 및 반려 시각
    approved_at TIMESTAMP(3) NULL,
    rejected_at TIMESTAMP(3) NULL,

    -- 수동 처리 관리자
    reviewed_by_admin_id BIGINT UNSIGNED NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 외래 키
    CONSTRAINT fk_charge_requests_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_charge_requests_account
        FOREIGN KEY (deposit_account_id)
        REFERENCES deposit_accounts(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_charge_requests_suggested_deposit
        FOREIGN KEY (suggested_bank_deposit_id)
        REFERENCES bank_deposits(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_charge_requests_bank_deposit
        FOREIGN KEY (bank_deposit_id)
        REFERENCES bank_deposits(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_charge_requests_reviewed_by
        FOREIGN KEY (reviewed_by_admin_id)
        REFERENCES admin_accounts(id)
        ON DELETE RESTRICT
);
