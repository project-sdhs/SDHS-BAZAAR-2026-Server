
CREATE TABLE school_members (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    email VARCHAR(254) NOT NULL,

    name VARCHAR(50) NULL,

    member_type VARCHAR(10) NOT NULL
        CHECK (member_type IN ('student', 'teacher')),

    class_id BIGINT UNSIGNED NULL,

    student_no VARCHAR(5) NULL,

    is_class_leader BOOLEAN NOT NULL DEFAULT FALSE,

    source VARCHAR(20) NOT NULL
        CHECK (source IN ('google_sync', 'manual')),

    google_group_id BIGINT UNSIGNED NULL,

    last_sync_run_id BIGINT UNSIGNED NULL,

    overridden_by_admin_id BIGINT UNSIGNED NULL,

    overridden_at TIMESTAMP(3) NULL,

    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    CONSTRAINT fk_school_members_class
        FOREIGN KEY (class_id)
        REFERENCES classes(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_school_members_google_group
        FOREIGN KEY (google_group_id)
        REFERENCES google_groups(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_school_members_sync_run
        FOREIGN KEY (last_sync_run_id)
        REFERENCES google_group_sync_runs(id)
        ON DELETE RESTRICT
);
