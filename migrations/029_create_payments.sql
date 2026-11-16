
-- DB-12: 결제 테이블 생성

CREATE TABLE payments (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 결제한 사용자
    user_id BIGINT UNSIGNED NOT NULL,

    -- 결제한 부스
    booth_id BIGINT UNSIGNED NOT NULL,

    -- QR 출처
    source VARCHAR(10) NOT NULL DEFAULT 'print'
        CHECK (source IN ('print', 'board')),

    -- 결제 상태
    status VARCHAR(20) NOT NULL DEFAULT 'completed'
        CHECK (status IN ('completed', 'refunded')),

    -- 부스별 일일 결제 번호
    payment_no INT NOT NULL
        CHECK (payment_no >= 1),

    -- 결제 총액
    total_amount BIGINT NOT NULL
        CHECK (total_amount > 0),

    -- 결제 시각
    paid_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    -- 결제일 (Asia/Seoul 기준)
    business_date DATE NOT NULL,

    -- 중복 결제 방지 키
    idempotency_key CHAR(36) NOT NULL,

    -- 요청 본문 SHA-256 해시
    request_hash CHAR(64) NOT NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 사용자 외래 키
    CONSTRAINT fk_payments_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    -- 부스 외래 키
    CONSTRAINT fk_payments_booth
        FOREIGN KEY (booth_id)
        REFERENCES booths(id)
        ON DELETE RESTRICT
);
