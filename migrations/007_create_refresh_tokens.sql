
CREATE TABLE refresh_tokens (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    user_id BIGINT UNSIGNED NOT NULL,

    token_hash CHAR(64) NOT NULL,

    platform VARCHAR(10) NULL
        CHECK (platform IN ('ios', 'android', 'web')),

    expires_at TIMESTAMP(3) NOT NULL,

    revoked_at TIMESTAMP(3) NULL,

    revoked_reason VARCHAR(20) NULL
        CHECK (
            revoked_reason IN (
                'rotated',
                'logout',
                'reuse_detected',
                'account_deleted'
            )
        ),

    replaced_by_id BIGINT UNSIGNED NULL,

    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    CONSTRAINT fk_refresh_tokens_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_refresh_tokens_replaced_by
        FOREIGN KEY (replaced_by_id)
        REFERENCES refresh_tokens(id)
        ON DELETE RESTRICT
);
