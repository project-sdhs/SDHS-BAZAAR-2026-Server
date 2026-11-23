-- DB-16: 결제 상태 ↔ 환불 행 검사
-- 조회 전용 · 정상이면 0행
-- 환불은 결제당 한 번, 전액이고, 같은 트랜잭션에서 status completed → refunded + 환불 행을 써요. (서버 규칙 15)

WITH refund_counts AS (
    SELECT
        payment_id,
        COUNT(*) AS refund_count
    FROM payment_refunds
    WHERE deleted_at IS NULL
    GROUP BY payment_id
)

-- 1. refunded 인데 환불 행이 없음
SELECT
    'REFUNDED_WITHOUT_REFUND_ROW' AS issue_type,
    p.id AS payment_id,
    p.user_id,
    1 AS expected_value,
    0 AS actual_value
FROM payments p
LEFT JOIN refund_counts rc
    ON rc.payment_id = p.id
WHERE p.deleted_at IS NULL
  AND p.status = 'refunded'
  AND rc.payment_id IS NULL

UNION ALL

-- 2. 환불 행이 있는데 결제가 completed
SELECT
    'REFUND_ROW_BUT_COMPLETED',
    p.id,
    p.user_id,
    0,
    rc.refund_count
FROM payments p
JOIN refund_counts rc
    ON rc.payment_id = p.id
WHERE p.deleted_at IS NULL
  AND p.status = 'completed'

UNION ALL

-- 3. 한 결제에 환불 행이 2개 이상
SELECT
    'MULTIPLE_REFUNDS',
    p.id,
    p.user_id,
    1,
    rc.refund_count
FROM payments p
JOIN refund_counts rc
    ON rc.payment_id = p.id
WHERE rc.refund_count > 1

ORDER BY issue_type, payment_id;
