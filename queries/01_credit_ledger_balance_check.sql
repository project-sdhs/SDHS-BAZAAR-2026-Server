
-- DB-16: 크레딧 원장 잔액 정합성 검사
-- 사용자별 이전 잔액 + 변동액 = 거래 후 잔액

WITH ledger_history AS (
    SELECT
        id,
        user_id,
        entry_type,
        amount,
        balance_after,
        created_at,
        LAG(balance_after) OVER (
            PARTITION BY user_id
            ORDER BY created_at, id
        ) AS previous_balance
    FROM credit_ledger_entries
    WHERE deleted_at IS NULL
)
SELECT
    id,
    user_id,
    entry_type,
    amount,
    previous_balance,
    balance_after
FROM ledger_history
WHERE (
    previous_balance IS NOT NULL
    AND previous_balance + amount <> balance_after
)
OR (
    previous_balance IS NULL
    AND amount <> balance_after
);
