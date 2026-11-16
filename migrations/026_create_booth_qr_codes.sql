
-- DB-11: 부스 QR 코드 발급 및 무효화 이력

CREATE TABLE booth_qr_codes (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- QR 코드가 속한 부스
    booth_id BIGINT UNSIGNED NOT NULL,

    -- QR 코드 (영문+숫자 10자리)
    code VARCHAR(10) NOT NULL,

    -- QR 발급 관리자 (초기 데이터는 NULL)
    issued_by_admin_id BIGINT UNSIGNED NULL,

    -- 무효화 시각 (NULL이면 활성 QR)
    deactivated_at TIMESTAMP(3) NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 부스 외래 키
    CONSTRAINT fk_booth_qr_codes_booth
        FOREIGN KEY (booth_id)
        REFERENCES booths(id)
        ON DELETE RESTRICT,

    -- 발급 관리자 외래 키
    CONSTRAINT fk_booth_qr_codes_issued_by_admin
        FOREIGN KEY (issued_by_admin_id)
        REFERENCES admin_accounts(id)
        ON DELETE RESTRICT
);
