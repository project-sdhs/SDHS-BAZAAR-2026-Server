
-- DB-16: 메뉴별 판매 통계 조회
-- 결제 당시 저장된 메뉴명과 단가를 기준으로 집계
-- 조회 전용: 데이터 변경 없음

SELECT
    p.booth_id,
    p.business_date,
    pi.menu_id,
    pi.menu_name,

    COUNT(DISTINCT p.id) AS order_count,

    SUM(pi.quantity) AS total_quantity,

    SUM(pi.amount) AS total_sales

FROM payment_items pi

JOIN payments p
    ON p.id = pi.payment_id

WHERE p.deleted_at IS NULL
  AND pi.deleted_at IS NULL
  AND p.status = 'completed'

GROUP BY
    p.booth_id,
    p.business_date,
    pi.menu_id,
    pi.menu_name

ORDER BY
    p.business_date,
    p.booth_id,
    total_sales DESC;
