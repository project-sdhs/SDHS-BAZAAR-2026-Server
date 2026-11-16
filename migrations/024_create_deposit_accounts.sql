
-- DB-10: 입금 계좌 테이블 생성

CREATE TABLE deposit_accounts (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 은행 이름
    bank_name VARCHAR(30) NOT NULL,

    -- 계좌번호
    account_no VARCHAR(30) NOT NULL,

    -- 예금주
    holder_name VARCHAR(30) NOT NULL,

    -- 계좌를 등록한 관리자
    -- 초기 데이터일 경우 NULL
    created_by_admin_id BIGINT UNSIGNED NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 관리자 외래 키
    CONSTRAINT fk_deposit_accounts_created_by_admin
        FOREIGN KEY (created_by_admin_id)
        REFERENCES admin_accounts(id)
        ON DELETE RESTRICT
);
