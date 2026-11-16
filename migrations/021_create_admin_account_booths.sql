
-- DB-07: 관리자 계정별 담당 부스 연결

CREATE TABLE admin_account_booths (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 담당 관리자 계정
    admin_id BIGINT UNSIGNED NOT NULL,

    -- 관리자가 담당하는 부스
    booth_id BIGINT UNSIGNED NOT NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 관리자 외래 키
    CONSTRAINT fk_admin_account_booths_admin
        FOREIGN KEY (admin_id)
        REFERENCES admin_accounts(id)
        ON DELETE RESTRICT,

    -- 부스 외래 키
    CONSTRAINT fk_admin_account_booths_booth
        FOREIGN KEY (booth_id)
        REFERENCES booths(id)
        ON DELETE RESTRICT
);
