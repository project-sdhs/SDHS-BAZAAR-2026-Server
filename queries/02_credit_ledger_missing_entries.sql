
-- DB-16: 충전·결제·환불의 크레딧 원장 누락 검사
-- 조회 전용: 실제 데이터를 변경하지 않음

-- 1. 승인된 충전인데 원장 기록이 없는 경우
SELECT
    'CHARGE' AS issue_type,
    cr.id AS transaction_id,
    cr.user_id
FROM charge_requests cr
WHERE cr.status = 'approved'
  AND NOT EXISTS (
      SELECT 1
      FROM credit_ledger_entries cle
      WHERE cle.charge_request_id = cr.id
        AND cle.entry_type = 'charge'
        AND cle.deleted_at IS NULL
  )

UNION ALL

-- 2. 완료된 결제인데 원장 기록이 없는 경우
SELECT
    'PAYMENT' AS issue_type,
    p.id AS transaction_id,
    p.user_id
FROM payments p
WHERE p.status IN ('completed', 'refunded')
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM credit_ledger_entries cle
      WHERE cle.payment_id = p.id
        AND cle.entry_type = 'payment'
        AND cle.deleted_at IS NULL
  )

UNION ALL

-- 3. 환불됐는데 원장 기록이 없는 경우
SELECT
    'REFUND' AS issue_type,
    pr.id AS transaction_id,
    p.user_id
FROM payment_refunds pr
JOIN payments p ON p.id = pr.payment_id
WHERE pr.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM credit_ledger_entries cle
      WHERE cle.payment_refund_id = pr.id
        AND cle.entry_type = 'refund'
        AND cle.deleted_at IS NULL
  );
