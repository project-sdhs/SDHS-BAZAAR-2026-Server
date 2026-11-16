
-- DB-11: 메뉴판 기기 연결 이력 테이블

CREATE TABLE board_devices (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 연결된 부스
    booth_id BIGINT UNSIGNED NOT NULL,

    -- 기기 인증 토큰의 SHA-256 해시
    token_hash CHAR(64) NOT NULL,

    -- 마지막 접속 시각
    last_seen_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    -- 토큰 폐기 시각
    revoked_at TIMESTAMP(3) NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 부스 외래 키
    CONSTRAINT fk_board_devices_booth
        FOREIGN KEY (booth_id)
        REFERENCES booths(id)
        ON DELETE RESTRICT
);
