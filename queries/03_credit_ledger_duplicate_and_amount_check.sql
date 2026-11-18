
-- DB-16: 원장 중복 및 거래 금액 불일치 검사
-- SELECT 전용: 데이터 변경 없음

-- 1. 동일 충전 요청 중복
SELECT
    'DUPLICATE_CHARGE' AS issue_type,
    charge_request_id AS transaction_id,
    COUNT(*) AS issue_value
FROM credit_ledger_entries
WHERE deleted_at IS NULL
  AND entry_type = 'charge'
  AND charge_request_id IS NOT NULL
GROUP BY charge_request_id
HAVING COUNT(*) > 1

UNION ALL

-- 2. 동일 결제 중복
SELECT
    'DUPLICATE_PAYMENT',
    payment_id,
    COUNT(*)
FROM credit_ledger_entries
WHERE deleted_at IS NULL
  AND entry_type = 'payment'
  AND payment_id IS NOT NULL
GROUP BY payment_id
HAVING COUNT(*) > 1

UNION ALL

-- 3. 동일 환불 중복
SELECT
    'DUPLICATE_REFUND',
    payment_refund_id,
    COUNT(*)
FROM credit_ledger_entries
WHERE deleted_at IS NULL
  AND entry_type = 'refund'
  AND payment_refund_id IS NOT NULL
GROUP BY payment_refund_id
HAVING COUNT(*) > 1

UNION ALL

-- 4. 충전 금액 불일치
SELECT
    'CHARGE_AMOUNT_MISMATCH',
    cle.charge_request_id,
    1
FROM credit_ledger_entries cle
JOIN charge_requests cr
    ON cr.id = cle.charge_request_id
WHERE cle.deleted_at IS NULL
  AND cle.entry_type = 'charge'
  AND cle.amount <> cr.amount

UNION ALL

-- 5. 결제 금액 불일치
SELECT
    'PAYMENT_AMOUNT_MISMATCH',
    cle.payment_id,
    1
FROM credit_ledger_entries cle
JOIN payments p
    ON p.id = cle.payment_id
WHERE cle.deleted_at IS NULL
  AND cle.entry_type = 'payment'
  AND cle.amount <> -p.total_amount

ORDER BY issue_type, transaction_id;
