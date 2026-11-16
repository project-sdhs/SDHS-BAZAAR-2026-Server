
-- DB-13: 크레딧 원장 테이블

CREATE TABLE credit_ledger_entries (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 크레딧 소유 사용자
    user_id BIGINT UNSIGNED NOT NULL,

    -- 크레딧 변동 유형
    entry_type VARCHAR(10) NOT NULL
        CHECK (
            entry_type IN (
                'charge',
                'payment',
                'refund',
                'adjustment'
            )
        ),

    -- 크레딧 변동 금액 (+ 또는 -)
    amount BIGINT NOT NULL,

    -- 변동 후 잔액
    balance_after BIGINT NOT NULL
        CHECK (balance_after >= 0),

    -- 충전 요청 참조
    charge_request_id BIGINT UNSIGNED NULL,

    -- 결제 참조
    payment_id BIGINT UNSIGNED NULL,

    -- 환불 참조
    payment_refund_id BIGINT UNSIGNED NULL,

    -- 잔액 조정 관리자
    adjusted_by_admin_id BIGINT UNSIGNED NULL,

    -- 조정 사유
    reason VARCHAR(200) NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 사용자 외래 키
    CONSTRAINT fk_credit_ledger_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    -- 충전 요청 외래 키
    CONSTRAINT fk_credit_ledger_charge
        FOREIGN KEY (charge_request_id)
        REFERENCES charge_requests(id)
        ON DELETE RESTRICT,

    -- 결제 외래 키
    CONSTRAINT fk_credit_ledger_payment
        FOREIGN KEY (payment_id)
        REFERENCES payments(id)
        ON DELETE RESTRICT,

    -- 환불 외래 키
    CONSTRAINT fk_credit_ledger_refund
        FOREIGN KEY (payment_refund_id)
        REFERENCES payment_refunds(id)
        ON DELETE RESTRICT,

    -- 조정 관리자 외래 키
    CONSTRAINT fk_credit_ledger_admin
        FOREIGN KEY (adjusted_by_admin_id)
        REFERENCES admin_accounts(id)
        ON DELETE RESTRICT
);
