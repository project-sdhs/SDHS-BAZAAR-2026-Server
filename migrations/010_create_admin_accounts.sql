
CREATE TABLE admin_accounts (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    email VARCHAR(254) NOT NULL,

    name VARCHAR(20) NULL,

    role VARCHAR(20) NOT NULL
        CHECK (role IN ('admin', 'teacher', 'class_leader')),

    scope_all BOOLEAN NOT NULL DEFAULT FALSE,

    can_review_payments BOOLEAN NOT NULL DEFAULT FALSE,

    can_review_charges BOOLEAN NOT NULL DEFAULT FALSE,

    user_id BIGINT UNSIGNED NULL,

    disabled_at TIMESTAMP(3) NULL,

    last_login_at TIMESTAMP(3) NULL,

    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    CONSTRAINT fk_admin_accounts_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
);
