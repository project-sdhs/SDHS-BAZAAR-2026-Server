-- DB-16: 부스 메뉴 통계(반정규화) 검사
-- 조회 전용 · 정상이면 0행
--
-- booths.min_price = 판매 중 메뉴 최저가 (판매 중 메뉴가 없으면 NULL)
-- booths.menu_count = 판매 중 메뉴 수 (전체 메뉴 수가 아님)
-- 메뉴를 쓸 때마다 서버가 다시 계산해서 넣어요. (서버 규칙 25)

WITH on_sale_stats AS (
    SELECT
        booth_id,
        MIN(price) AS min_price,
        COUNT(*) AS menu_count
    FROM menus
    WHERE deleted_at IS NULL
      AND on_sale = TRUE
    GROUP BY booth_id
)

-- 1. 최저가가 다름
SELECT
    'MIN_PRICE_MISMATCH' AS issue_type,
    b.id AS booth_id,
    s.min_price AS expected_value,
    b.min_price AS actual_value
FROM booths b
LEFT JOIN on_sale_stats s
    ON s.booth_id = b.id
WHERE b.deleted_at IS NULL
  AND NOT (b.min_price <=> s.min_price)

UNION ALL

-- 2. 판매 중 메뉴 수가 다름
SELECT
    'MENU_COUNT_MISMATCH',
    b.id,
    COALESCE(s.menu_count, 0),
    b.menu_count
FROM booths b
LEFT JOIN on_sale_stats s
    ON s.booth_id = b.id
WHERE b.deleted_at IS NULL
  AND b.menu_count <> COALESCE(s.menu_count, 0)

ORDER BY booth_id, issue_type;
