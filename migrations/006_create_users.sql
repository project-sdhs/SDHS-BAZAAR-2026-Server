
CREATE TABLE users (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    auth_provider VARCHAR(20) NOT NULL
        CHECK (auth_provider IN ('google', 'kakao', 'apple')),

    auth_subject VARCHAR(255) NOT NULL,

    email VARCHAR(254) NULL,

    google_hosted_domain VARCHAR(255) NULL,

    name VARCHAR(100) NULL,

    school_member_id BIGINT UNSIGNED NULL,

    verified_at TIMESTAMP(3) NULL,

    verified_by_user_id BIGINT UNSIGNED NULL,

    verified_by_admin_id BIGINT UNSIGNED NULL,

    deposit_code VARCHAR(10) NULL,

    credit_balance BIGINT NOT NULL DEFAULT 0
        CHECK (credit_balance >= 0),

    last_login_at TIMESTAMP(3) NULL,

    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    CONSTRAINT fk_users_school_member
        FOREIGN KEY (school_member_id)
        REFERENCES school_members(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_users_verified_by_user
        FOREIGN KEY (verified_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
);
