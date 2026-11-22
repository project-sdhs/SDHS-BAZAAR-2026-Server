-- DB-16: 부스별 결제 번호 · 결제 번호 카운터 검사
-- 조회 전용 · 정상이면 0행
--
-- 결제 번호는 부스 × 날짜(business_date) 안에서 빈 번호 · 중복 없이 1씩 늘어요. (서버 규칙 12)
-- 그날 첫 번호는 daily_payment_no_reset 이 켜져 있으면 1, 꺼져 있으면 직전 날짜 마지막 번호 + 1.
-- 설정은 다음 날부터 바뀌어서 날짜마다 둘 중 하나면 정상으로 봐요.
-- 카운터: 그날 booth_daily_payment_counters.last_no = 그날 MAX(payment_no), 부스 × 날짜마다 1행.

WITH numbered AS (
    SELECT
        id,
        booth_id,
        business_date,
        payment_no,
        LAG(payment_no) OVER (
            PARTITION BY booth_id, business_date
            ORDER BY payment_no, id
        ) AS previous_no,
        COUNT(*) OVER (
            PARTITION BY booth_id, business_date, payment_no
        ) AS same_no_count
    FROM payments
    WHERE deleted_at IS NULL
),
daily AS (
    SELECT
        booth_id,
        business_date,
        MIN(payment_no) AS first_no,
        MAX(payment_no) AS last_no
    FROM payments
    WHERE deleted_at IS NULL
    GROUP BY booth_id, business_date
),
daily_with_previous AS (
    SELECT
        booth_id,
        business_date,
        first_no,
        last_no,
        LAG(last_no) OVER (
            PARTITION BY booth_id
            ORDER BY business_date
        ) AS previous_day_last_no
    FROM daily
),
counters AS (
    SELECT
        id,
        booth_id,
        business_date,
        last_no
    FROM booth_daily_payment_counters
    WHERE deleted_at IS NULL
)

-- 1. 같은 날 같은 번호
SELECT
    'DUPLICATE_NUMBER' AS issue_type,
    booth_id,
    business_date,
    id AS payment_id,
    NULL AS expected_no,
    payment_no AS actual_no
FROM numbered
WHERE same_no_count > 1

UNION ALL

-- 2. 같은 날 안에서 번호가 건너뜀
SELECT
    'NUMBER_GAP',
    booth_id,
    business_date,
    id,
    previous_no + 1,
    payment_no
FROM numbered
WHERE previous_no IS NOT NULL
  AND payment_no > previous_no + 1

UNION ALL

-- 3. 그날 첫 번호가 1도 아니고 직전 날짜 마지막 번호 + 1 도 아님
SELECT
    'FIRST_NUMBER_WRONG',
    booth_id,
    business_date,
    NULL,
    1,
    first_no
FROM daily_with_previous
WHERE first_no <> 1
  AND (previous_day_last_no IS NULL OR first_no <> previous_day_last_no + 1)

UNION ALL

-- 4. 결제가 있는 날의 카운터가 없거나 last_no ≠ 그날 MAX(payment_no)
SELECT
    'COUNTER_MISMATCH',
    d.booth_id,
    d.business_date,
    NULL,
    d.last_no,
    c.last_no
FROM daily d
LEFT JOIN counters c
    ON c.booth_id = d.booth_id
    AND c.business_date = d.business_date
WHERE c.id IS NULL
   OR c.last_no <> d.last_no

UNION ALL

-- 5. 결제가 없는 날인데 카운터가 0이 아님
SELECT
    'COUNTER_WITHOUT_PAYMENTS',
    c.booth_id,
    c.business_date,
    NULL,
    0,
    c.last_no
FROM counters c
WHERE c.last_no <> 0
  AND NOT EXISTS (
      SELECT 1
      FROM daily d
      WHERE d.booth_id = c.booth_id
        AND d.business_date = c.business_date
  )

UNION ALL

-- 6. 부스 × 날짜 카운터가 2행 이상
SELECT
    'DUPLICATE_COUNTER',
    booth_id,
    business_date,
    NULL,
    1,
    COUNT(*)
FROM counters
GROUP BY booth_id, business_date
HAVING COUNT(*) > 1

ORDER BY booth_id, business_date, issue_type, payment_id;
