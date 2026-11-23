
-- DB-06: 층별 구역 테이블 생성

CREATE TABLE zones (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 구역이 속한 층
    floor_id BIGINT UNSIGNED NOT NULL,

    -- 구역 이름 (로비, 복도, 교실 등)
    name VARCHAR(20) NOT NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 층과 연결하는 외래 키
    CONSTRAINT fk_zones_floor
        FOREIGN KEY (floor_id)
        REFERENCES floors(id)
        ON DELETE RESTRICT
);
