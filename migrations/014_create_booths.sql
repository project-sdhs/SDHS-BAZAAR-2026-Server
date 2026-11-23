
-- DB-05: 부스 테이블 생성

CREATE TABLE booths (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    class_id BIGINT UNSIGNED NULL,

    name VARCHAR(30) NOT NULL,
    category VARCHAR(10) NOT NULL DEFAULT '기타',

    type VARCHAR(10) NOT NULL DEFAULT 'normal'
        CHECK (type IN ('normal', 'special')),

    manual_status VARCHAR(10) NOT NULL DEFAULT 'preparing'
        CHECK (manual_status IN ('preparing', 'open', 'closed')),

    hidden BOOLEAN NOT NULL DEFAULT TRUE,

    featured_order INT NULL,

    open_time TIME NOT NULL,
    close_time TIME NOT NULL,

    description VARCHAR(2000) NOT NULL DEFAULT '',
    image_url VARCHAR(255) NULL,

    booth_code VARCHAR(6) NOT NULL,

    min_price BIGINT NULL,

    menu_count INT NOT NULL DEFAULT 0,

    ordering_paused BOOLEAN NOT NULL DEFAULT FALSE,
    paused_at TIMESTAMP(3) NULL,
    paused_by_user_id BIGINT UNSIGNED NULL,

    edited_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    edited_by_admin_id BIGINT UNSIGNED NULL,

    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    CONSTRAINT fk_booths_class
        FOREIGN KEY (class_id)
        REFERENCES classes(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_booths_paused_by_user
        FOREIGN KEY (paused_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_booths_edited_by_admin
        FOREIGN KEY (edited_by_admin_id)
        REFERENCES admin_accounts(id)
        ON DELETE RESTRICT
);
