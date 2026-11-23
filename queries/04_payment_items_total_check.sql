-- DB-16: 결제 총액 · 결제 메뉴 금액 검사
-- 조회 전용 · 정상이면 0행

-- 1. 결제 총액 ≠ 결제 메뉴 금액 합계 (메뉴가 한 줄도 없으면 합계 0)
SELECT
    'ITEMS_TOTAL_MISMATCH' AS issue_type,
    p.id AS payment_id,
    NULL AS payment_item_id,
    p.user_id,
    p.total_amount AS expected_value,
    COALESCE(SUM(pi.amount), 0) AS actual_value
FROM payments p
LEFT JOIN payment_items pi
    ON pi.payment_id = p.id
    AND pi.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.user_id, p.total_amount
HAVING p.total_amount <> COALESCE(SUM(pi.amount), 0)

UNION ALL

-- 2. 결제 메뉴 한 줄의 금액 ≠ 단가 × 수량
SELECT
    'ITEM_AMOUNT_MISMATCH',
    pi.payment_id,
    pi.id,
    p.user_id,
    pi.unit_price * pi.quantity,
    pi.amount
FROM payment_items pi
JOIN payments p
    ON p.id = pi.payment_id
WHERE pi.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND pi.amount <> pi.unit_price * pi.quantity

ORDER BY issue_type, payment_id, payment_item_id;
