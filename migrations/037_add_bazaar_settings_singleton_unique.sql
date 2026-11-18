
-- DB-10: 바자회 설정 중복 생성 방지
-- bazaar_settings 테이블은 최대 1행만 허용

ALTER TABLE bazaar_settings
    ADD CONSTRAINT uq_bazaar_settings_singleton
    UNIQUE (singleton);
