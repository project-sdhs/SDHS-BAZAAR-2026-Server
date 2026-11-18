
-- DB-16: 결제 총액과 메뉴 합계 불일치 검사
-- 조회 전용

SELECT
    p.id AS payment_id,
    p.total_amount AS payment_total,
    COALESCE(SUM(pi.amount), 0) AS items_total,
    p.total_amount - COALESCE(SUM(pi.amount), 0) AS difference
FROM payments p
LEFT JOIN payment_items pi
    ON pi.payment_id = p.id
    AND pi.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.total_amount
HAVING p.total_amount <> items_total;
