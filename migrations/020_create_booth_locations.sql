
-- DB-06: 부스 지도 위치 테이블 생성

CREATE TABLE booth_locations (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 위치가 등록된 부스
    booth_id BIGINT UNSIGNED NOT NULL,

    -- 부스가 위치한 층
    floor_id BIGINT UNSIGNED NOT NULL,

    -- 세부 구역 (선택)
    zone_id BIGINT UNSIGNED NULL,

    -- 지도 이미지 기준 위치 비율 (0~1)
    x DOUBLE NOT NULL
        CHECK (x BETWEEN 0 AND 1),

    y DOUBLE NOT NULL
        CHECK (y BETWEEN 0 AND 1),

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 외래 키
    CONSTRAINT fk_booth_locations_booth
        FOREIGN KEY (booth_id)
        REFERENCES booths(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_booth_locations_floor
        FOREIGN KEY (floor_id)
        REFERENCES floors(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_booth_locations_zone
        FOREIGN KEY (zone_id)
        REFERENCES zones(id)
        ON DELETE RESTRICT
);
