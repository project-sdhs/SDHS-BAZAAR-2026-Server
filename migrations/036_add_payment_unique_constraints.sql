
-- DB-14: 결제 중복 방지 제약조건

-- 사용자별 결제 요청 키 중복 방지
ALTER TABLE payments
    ADD CONSTRAINT uq_payments_user_idempotency
    UNIQUE (user_id, idempotency_key);

-- 부스별 영업일 결제번호 중복 방지
ALTER TABLE payments
    ADD CONSTRAINT uq_payments_booth_daily_number
    UNIQUE (booth_id, business_date, payment_no);

-- 부스별 영업일 카운터 중복 생성 방지
ALTER TABLE booth_daily_payment_counters
    ADD CONSTRAINT uq_booth_daily_payment_counters_date
    UNIQUE (booth_id, business_date);
