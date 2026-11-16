
CREATE TABLE google_groups (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    group_email VARCHAR(254) NOT NULL,

    group_type VARCHAR(10) NOT NULL
        CHECK (group_type IN ('class', 'teacher')),

    class_id BIGINT UNSIGNED NULL,

    display_name VARCHAR(100) NULL,

    created_by_admin_id BIGINT UNSIGNED NULL,

    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    CONSTRAINT fk_google_groups_class
        FOREIGN KEY (class_id)
        REFERENCES classes(id)
        ON DELETE RESTRICT
);
