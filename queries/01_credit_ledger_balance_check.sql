-- DB-16: 원장 ↔ 잔액 검사
-- 조회 전용 · 정상이면 0행
--
-- 1. 원장 사슬: 사용자마다 id 순으로 (앞 항목의 balance_after, 첫 항목이면 0) + amount = balance_after
--    사슬 순서는 created_at 이 아니라 id (사용자 행을 잠근 뒤 INSERT 하니까 id 순 = 잔액 순서)
-- 2. 잔액 캐시: users.credit_balance = 원장 합계 = 마지막 항목의 balance_after (원장이 없으면 0)
--    탈퇴한 사용자도 봐요. 몰수된 크레딧은 원장 항목 없이 credit_balance 에 그대로 남아요.

WITH ledger AS (
    SELECT
        id,
        user_id,
        amount,
        balance_after,
        COALESCE(
            LAG(balance_after) OVER (
                PARTITION BY user_id
                ORDER BY id
            ),
            0
        ) AS previous_balance,
        ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY id DESC
        ) AS reverse_no
    FROM credit_ledger_entries
    WHERE deleted_at IS NULL
),
ledger_totals AS (
    SELECT
        user_id,
        SUM(amount) AS ledger_sum,
        MAX(CASE WHEN reverse_no = 1 THEN balance_after END) AS last_balance_after
    FROM ledger
    GROUP BY user_id
)

-- 1. 원장 사슬이 끊긴 항목
SELECT
    'LEDGER_CHAIN_BROKEN' AS issue_type,
    l.user_id,
    l.id AS ledger_entry_id,
    l.previous_balance + l.amount AS expected_value,
    l.balance_after AS actual_value
FROM ledger l
WHERE l.previous_balance + l.amount <> l.balance_after

UNION ALL

-- 2. 잔액 캐시가 원장 합계 · 마지막 balance_after 와 다른 사용자
SELECT
    'BALANCE_MISMATCH',
    u.id,
    NULL,
    COALESCE(t.ledger_sum, 0),
    u.credit_balance
FROM users u
LEFT JOIN ledger_totals t
    ON t.user_id = u.id
WHERE u.credit_balance <> COALESCE(t.ledger_sum, 0)
   OR u.credit_balance <> COALESCE(t.last_balance_after, 0)

ORDER BY user_id, ledger_entry_id;
