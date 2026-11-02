
CREATE TABLE google_group_sync_runs (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    started_by_admin_id BIGINT UNSIGNED NOT NULL,

    status VARCHAR(20) NOT NULL
        DEFAULT 'running'
        CHECK (status IN ('running', 'succeeded', 'failed')),

    finished_at TIMESTAMP(3) NULL,

    result_summary JSON NULL,

    error_message VARCHAR(500) NULL,

    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL
);
