
-- DB-05: 부스별 캐셔(계산 담당자) 연결 테이블

CREATE TABLE booth_cashiers (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 캐셔가 담당하는 부스
    booth_id BIGINT UNSIGNED NOT NULL,

    -- 캐셔로 지정된 사용자
    user_id BIGINT UNSIGNED NOT NULL,

    -- 캐셔를 지정한 반장(앱)
    assigned_by_user_id BIGINT UNSIGNED NULL,

    -- 캐셔를 지정한 관리자(웹)
    assigned_by_admin_id BIGINT UNSIGNED NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 외래 키 4개
    CONSTRAINT fk_booth_cashiers_booth
        FOREIGN KEY (booth_id)
        REFERENCES booths(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_booth_cashiers_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_booth_cashiers_assigned_by_user
        FOREIGN KEY (assigned_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_booth_cashiers_assigned_by_admin
        FOREIGN KEY (assigned_by_admin_id)
        REFERENCES admin_accounts(id)
        ON DELETE RESTRICT
);
