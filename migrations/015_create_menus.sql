
-- DB-05: 부스 메뉴 테이블 생성

CREATE TABLE menus (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 메뉴가 소속된 부스
    booth_id BIGINT UNSIGNED NOT NULL,

    -- 메뉴 기본 정보
    name VARCHAR(30) NOT NULL,
    description VARCHAR(40) NULL,

    -- 가격: 1~100,000 크레딧
    price BIGINT NOT NULL
        CHECK (price BETWEEN 1 AND 100000),

    -- 판매 중 여부
    on_sale BOOLEAN NOT NULL DEFAULT TRUE,

    -- 메뉴 표시 순서
    sort_order INT NOT NULL
        CHECK (sort_order >= 1),

    image_url VARCHAR(255) NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 외래 키
    CONSTRAINT fk_menus_booth
        FOREIGN KEY (booth_id)
        REFERENCES booths(id)
        ON DELETE RESTRICT
);
