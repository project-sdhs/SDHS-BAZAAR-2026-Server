
CREATE TABLE class_teachers (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    class_id BIGINT UNSIGNED NOT NULL,

    school_member_id BIGINT UNSIGNED NOT NULL,

    is_homeroom BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    CONSTRAINT fk_class_teachers_class
        FOREIGN KEY (class_id)
        REFERENCES classes(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_class_teachers_school_member
        FOREIGN KEY (school_member_id)
        REFERENCES school_members(id)
        ON DELETE RESTRICT
);
