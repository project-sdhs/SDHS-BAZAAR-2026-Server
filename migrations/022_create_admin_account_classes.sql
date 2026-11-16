
-- DB-08: 관리자별 담당 반 연결 테이블

CREATE TABLE admin_account_classes (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 담당 관리자 계정
    admin_id BIGINT UNSIGNED NOT NULL,

    -- 담당 학급
    class_id BIGINT UNSIGNED NOT NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 관리자 외래 키
    CONSTRAINT fk_admin_account_classes_admin
        FOREIGN KEY (admin_id)
        REFERENCES admin_accounts(id)
        ON DELETE RESTRICT,

    -- 반 외래 키
    CONSTRAINT fk_admin_account_classes_class
        FOREIGN KEY (class_id)
        REFERENCES classes(id)
        ON DELETE RESTRICT
);
