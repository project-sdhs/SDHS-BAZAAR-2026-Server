
-- DB-10: 바자회 날짜 및 운영 시간 검증
-- 행사 종료일은 시작일보다 빠를 수 없음
-- 운영 종료 시간은 시작 시간보다 늦어야 함

ALTER TABLE bazaar_settings
    ADD CONSTRAINT chk_bazaar_event_dates
    CHECK (
        event_end_date >= event_start_date
    );

ALTER TABLE bazaar_settings
    ADD CONSTRAINT chk_bazaar_open_hours
    CHECK (
        default_close_time > default_open_time
    );
