-- DB-16: 충전 · 결제 · 환불의 원장 누락 검사
-- 조회 전용 · 정상이면 0행

-- 1. 승인된 충전인데 원장 기록이 없는 경우
SELECT
    'CHARGE_LEDGER_MISSING' AS issue_type,
    cr.id AS source_id,
    cr.user_id
FROM charge_requests cr
WHERE cr.status = 'approved'
  AND cr.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM credit_ledger_entries cle
      WHERE cle.charge_request_id = cr.id
        AND cle.entry_type = 'charge'
        AND cle.deleted_at IS NULL
  )

UNION ALL

-- 2. 결제(완료 · 환불됨)인데 결제 원장 기록이 없는 경우
SELECT
    'PAYMENT_LEDGER_MISSING',
    p.id,
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

-- 3. 환불됐는데 환불 원장 기록이 없는 경우
SELECT
    'REFUND_LEDGER_MISSING',
    pr.id,
    p.user_id
FROM payment_refunds pr
JOIN payments p
    ON p.id = pr.payment_id
WHERE pr.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM credit_ledger_entries cle
      WHERE cle.payment_refund_id = pr.id
        AND cle.entry_type = 'refund'
        AND cle.deleted_at IS NULL
  )

ORDER BY issue_type, source_id;
