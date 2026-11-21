
-- DB-10: 바자회 기본 설정 1행 생성
-- 행사명과 날짜는 임시값이며 실제 일정 확정 후 변경
-- 앱은 기본적으로 비공개 상태 유지

INSERT INTO bazaar_settings (
    event_name,
    event_start_date,
    event_end_date
)
SELECT
    '바자회 임시 설정',
    '2027-11-20',
    '2027-11-21'
WHERE NOT EXISTS (
    SELECT 1
    FROM bazaar_settings
    WHERE deleted_at IS NULL
);
