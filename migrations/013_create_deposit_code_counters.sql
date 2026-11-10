
-- 입금 코드 번호 카운터 테이블
-- 입금 코드 형식: V0001 ~ V9999

CREATE TABLE deposit_code_counters (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    last_no INT NOT NULL
        DEFAULT 0
        CHECK (last_no BETWEEN 0 AND 9999),

    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL
);

-- 최초 카운터 데이터 1행 생성
INSERT INTO deposit_code_counters (last_no)
VALUES (0);
