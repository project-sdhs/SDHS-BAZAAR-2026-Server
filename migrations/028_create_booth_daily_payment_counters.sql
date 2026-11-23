
-- DB-12: 부스별 일일 결제 번호 카운터

CREATE TABLE booth_daily_payment_counters (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 결제 번호가 속한 부스
    booth_id BIGINT UNSIGNED NOT NULL,

    -- 결제일 (Asia/Seoul 기준)
    business_date DATE NOT NULL,

    -- 해당 날짜 마지막 결제 번호
    last_no INT NOT NULL DEFAULT 0
        CHECK (last_no >= 0),

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 부스 외래 키
    CONSTRAINT fk_booth_daily_payment_counters_booth
        FOREIGN KEY (booth_id)
        REFERENCES booths(id)
        ON DELETE RESTRICT
);
