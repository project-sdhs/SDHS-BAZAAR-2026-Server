
-- DB-10: 바자회 전체 설정 테이블 생성

CREATE TABLE bazaar_settings (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 설정 행 여부
    singleton BOOLEAN NOT NULL DEFAULT TRUE
        CHECK (singleton = TRUE),

    -- 행사 정보
    event_name VARCHAR(40) NOT NULL,
    event_start_date DATE NOT NULL,
    event_end_date DATE NOT NULL,

    -- 기본 운영 시간
    default_open_time TIME NOT NULL
        DEFAULT '10:00:00',

    default_close_time TIME NOT NULL
        DEFAULT '15:00:00',

    -- 앱 공개 여부
    app_open BOOLEAN NOT NULL DEFAULT FALSE,

    -- 현재 사용 중인 입금 계좌
    deposit_account_id BIGINT UNSIGNED NULL,

    -- 입금자명 규칙
    depositor_name_rule VARCHAR(40) NOT NULL
        DEFAULT '{studentNo} {name}',

    depositor_name_rule_with_code VARCHAR(40) NOT NULL
        DEFAULT '{depositCode} {name}',

    -- 충전 한도
    charge_min BIGINT NOT NULL DEFAULT 1000
        CHECK (charge_min >= 1),

    charge_max BIGINT NULL,
    balance_limit BIGINT NULL,

    -- 환불 가능 시간
    refund_window_hours INT NOT NULL DEFAULT 24
        CHECK (refund_window_hours >= 0),

    -- 결제 번호 및 QR 정책
    daily_payment_no_reset BOOLEAN NOT NULL DEFAULT TRUE,
    block_old_qr BOOLEAN NOT NULL DEFAULT TRUE,

    -- 마지막 수정 관리자
    updated_by_admin_id BIGINT UNSIGNED NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 외래 키
    CONSTRAINT fk_bazaar_settings_deposit_account
        FOREIGN KEY (deposit_account_id)
        REFERENCES deposit_accounts(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_bazaar_settings_updated_by_admin
        FOREIGN KEY (updated_by_admin_id)
        REFERENCES admin_accounts(id)
        ON DELETE RESTRICT
);
