
-- DB-06: 층 테이블 생성

CREATE TABLE floors (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 소속 건물
    building_id BIGINT UNSIGNED NOT NULL,

    -- 층 번호 (1층, 2층, 3층 등)
    level SMALLINT NOT NULL,

    -- 화면 표시 이름 (예: 본관 1층)
    label VARCHAR(20) NOT NULL,

    -- 층 지도 이미지 경로
    map_image_url VARCHAR(255) NOT NULL,

    -- 지도 이미지의 실제 가로·세로 길이(m)
    width_m DOUBLE NOT NULL
        CHECK (width_m > 0),

    height_m DOUBLE NOT NULL
        CHECK (height_m > 0),

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 건물 외래 키
    CONSTRAINT fk_floors_building
        FOREIGN KEY (building_id)
        REFERENCES buildings(id)
        ON DELETE RESTRICT
);
