
-- DB-13: 은행 입금 CSV 업로드 이력

CREATE TABLE deposit_imports (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 입금받은 계좌
    deposit_account_id BIGINT UNSIGNED NOT NULL,

    -- 업로드한 원본 파일명
    original_filename VARCHAR(255) NOT NULL,

    -- 파일 크기 (최대 2MB)
    file_size_bytes INT NOT NULL
        CHECK (
            file_size_bytes BETWEEN 1 AND 2097152
        ),

    -- 파일 SHA-256 해시
    file_sha256 CHAR(64) NOT NULL,

    -- 중복으로 건너뛴 행 수
    skipped_count INT NOT NULL DEFAULT 0
        CHECK (skipped_count >= 0),

    -- 형식 오류가 발생한 행 수
    error_count INT NOT NULL DEFAULT 0
        CHECK (error_count >= 0),

    -- CSV 업로드 관리자
    uploaded_by_admin_id BIGINT UNSIGNED NOT NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 입금 계좌 외래 키
    CONSTRAINT fk_deposit_imports_account
        FOREIGN KEY (deposit_account_id)
        REFERENCES deposit_accounts(id)
        ON DELETE RESTRICT,

    -- 업로드 관리자 외래 키
    CONSTRAINT fk_deposit_imports_admin
        FOREIGN KEY (uploaded_by_admin_id)
        REFERENCES admin_accounts(id)
        ON DELETE RESTRICT
);
