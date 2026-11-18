
-- DB-10: 충전 금액 및 잔액 한도 검증

-- 최소 충전 금액은 기존 제약조건(charge_min >= 1)을 유지

-- 최대 충전 금액이 설정되었다면
-- 최소 충전 금액보다 크거나 같아야 함
ALTER TABLE bazaar_settings
    ADD CONSTRAINT chk_bazaar_charge_range
    CHECK (
        charge_max IS NULL
        OR charge_max >= charge_min
    );

-- 잔액 한도는 미설정(NULL)이거나 1원 이상
ALTER TABLE bazaar_settings
    ADD CONSTRAINT chk_bazaar_balance_limit
    CHECK (
        balance_limit IS NULL
        OR balance_limit >= 1
    );
