
-- DB-13: 은행 입금 내역 테이블

CREATE TABLE bank_deposits (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 입금 내역이 포함된 CSV 업로드
    deposit_import_id BIGINT UNSIGNED NOT NULL,

    -- CSV 줄 번호 (헤더는 1번)
    csv_line_no INT NOT NULL
        CHECK (csv_line_no >= 2),

    -- 입금받은 계좌
    deposit_account_id BIGINT UNSIGNED NOT NULL,

    -- 은행 거래 번호 (없는 경우 NULL)
    bank_transaction_no VARCHAR(64) NULL,

    -- 실제 입금 시각 (UTC 저장)
    deposited_at TIMESTAMP(3) NOT NULL,

    -- 은행 원본 입금자명
    depositor_name VARCHAR(50) NOT NULL,

    -- 정규화된 입금자명
    depositor_name_normalized VARCHAR(50) NOT NULL,

    -- 입금 금액
    amount BIGINT NOT NULL
        CHECK (amount > 0),

    -- 동일한 입금 내역의 순번
    identical_line_seq SMALLINT NOT NULL DEFAULT 1
        CHECK (identical_line_seq >= 1),

    -- 보낸 사람 은행
    sender_bank_name VARCHAR(30) NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- CSV 업로드 외래 키
    CONSTRAINT fk_bank_deposits_import
        FOREIGN KEY (deposit_import_id)
        REFERENCES deposit_imports(id)
        ON DELETE RESTRICT,

    -- 입금 계좌 외래 키
    CONSTRAINT fk_bank_deposits_account
        FOREIGN KEY (deposit_account_id)
        REFERENCES deposit_accounts(id)
        ON DELETE RESTRICT
);
