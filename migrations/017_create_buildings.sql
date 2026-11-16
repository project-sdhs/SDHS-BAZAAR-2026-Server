
-- DB-06: 건물 테이블 생성
-- 학교 건물(본관, 신관, 운동장 등) 관리

CREATE TABLE buildings (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 건물 이름
    name VARCHAR(20) NOT NULL,

    -- 지도 및 목록 표시 순서
    sort_order SMALLINT NOT NULL DEFAULT 0,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL
);
