
-- DB-12: 결제 환불 이력 테이블

CREATE TABLE payment_refunds (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 환불 대상 결제
    payment_id BIGINT UNSIGNED NOT NULL,

    -- 환불 처리 관리자
    refunded_by_admin_id BIGINT UNSIGNED NOT NULL,

    -- 환불 사유 (선택)
    reason VARCHAR(200) NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 결제 외래 키
    CONSTRAINT fk_payment_refunds_payment
        FOREIGN KEY (payment_id)
        REFERENCES payments(id)
        ON DELETE RESTRICT,

    -- 관리자 외래 키
    CONSTRAINT fk_payment_refunds_admin
        FOREIGN KEY (refunded_by_admin_id)
        REFERENCES admin_accounts(id)
        ON DELETE RESTRICT
);
