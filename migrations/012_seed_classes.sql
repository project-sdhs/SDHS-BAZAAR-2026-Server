
-- 학급 초기 데이터 등록
-- 1학년: 1~4반
-- 2학년: 1~4반
-- 3학년: 1~4반

INSERT INTO classes (grade, class_no)
SELECT seed.grade, seed.class_no
FROM (
    SELECT 1 AS grade, 1 AS class_no UNION ALL
    SELECT 1, 2 UNION ALL
    SELECT 1, 3 UNION ALL
    SELECT 1, 4 UNION ALL
    SELECT 2, 1 UNION ALL
    SELECT 2, 2 UNION ALL
    SELECT 2, 3 UNION ALL
    SELECT 2, 4 UNION ALL
    SELECT 3, 1 UNION ALL
    SELECT 3, 2 UNION ALL
    SELECT 3, 3 UNION ALL
    SELECT 3, 4
) AS seed
WHERE NOT EXISTS (
    SELECT 1
    FROM classes c
    WHERE c.grade = seed.grade
      AND c.class_no = seed.class_no
);
