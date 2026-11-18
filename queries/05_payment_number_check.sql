
-- DB-16: 부스별 일일 결제 번호 정합성 검사
-- 조회 전용: 데이터 변경 없음

WITH numbered_payments AS (
    SELECT
        id,
        booth_id,
        business_date,
        payment_no,
        ROW_NUMBER() OVER (
            PARTITION BY booth_id, business_date
            ORDER BY payment_no, id
        ) AS expected_no,
        COUNT(*) OVER (
            PARTITION BY booth_id, business_date, payment_no
        ) AS duplicate_count
    FROM payments
    WHERE deleted_at IS NULL
)

SELECT
    id AS payment_id,
    booth_id,
    business_date,
    payment_no,
    expected_no,
    CASE
        WHEN duplicate_count > 1 THEN 'DUPLICATE_NUMBER'
        ELSE 'NUMBER_GAP_OR_MISMATCH'
    END AS issue_type
FROM numbered_payments
WHERE duplicate_count > 1
   OR payment_no <> expected_no
ORDER BY booth_id, business_date, payment_no, id;
