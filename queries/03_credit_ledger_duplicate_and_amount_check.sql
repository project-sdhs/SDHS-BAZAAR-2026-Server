-- DB-16: 원장 중복 · 금액 · 모양 검사, 멱등 키 중복 검사
-- 조회 전용 · 정상이면 0행
-- 유니크 키가 없어서(ERD 설계) 중복은 여기서 찾아요.

-- 1. 같은 충전 요청의 원장이 2개 이상
SELECT
    'DUPLICATE_CHARGE_ENTRY' AS issue_type,
    charge_request_id AS source_id,
    MIN(user_id) AS user_id,
    1 AS expected_value,
    COUNT(*) AS actual_value
FROM credit_ledger_entries
WHERE deleted_at IS NULL
  AND entry_type = 'charge'
  AND charge_request_id IS NOT NULL
GROUP BY charge_request_id
HAVING COUNT(*) > 1

UNION ALL

-- 2. 같은 결제의 원장이 2개 이상
SELECT
    'DUPLICATE_PAYMENT_ENTRY',
    payment_id,
    MIN(user_id),
    1,
    COUNT(*)
FROM credit_ledger_entries
WHERE deleted_at IS NULL
  AND entry_type = 'payment'
  AND payment_id IS NOT NULL
GROUP BY payment_id
HAVING COUNT(*) > 1

UNION ALL

-- 3. 같은 환불의 원장이 2개 이상
SELECT
    'DUPLICATE_REFUND_ENTRY',
    payment_refund_id,
    MIN(user_id),
    1,
    COUNT(*)
FROM credit_ledger_entries
WHERE deleted_at IS NULL
  AND entry_type = 'refund'
  AND payment_refund_id IS NOT NULL
GROUP BY payment_refund_id
HAVING COUNT(*) > 1

UNION ALL

-- 4. 충전 원장 금액 ≠ 충전 요청 금액
SELECT
    'CHARGE_AMOUNT_MISMATCH',
    cle.charge_request_id,
    cle.user_id,
    cr.amount,
    cle.amount
FROM credit_ledger_entries cle
JOIN charge_requests cr
    ON cr.id = cle.charge_request_id
WHERE cle.deleted_at IS NULL
  AND cle.entry_type = 'charge'
  AND cle.amount <> cr.amount

UNION ALL

-- 5. 승인되지 않은 충전 요청에 충전 원장이 있음
SELECT
    'CHARGE_NOT_APPROVED',
    cle.charge_request_id,
    cle.user_id,
    NULL,
    NULL
FROM credit_ledger_entries cle
JOIN charge_requests cr
    ON cr.id = cle.charge_request_id
WHERE cle.deleted_at IS NULL
  AND cle.entry_type = 'charge'
  AND cr.status <> 'approved'

UNION ALL

-- 6. 결제 원장 금액 ≠ −결제 총액
SELECT
    'PAYMENT_AMOUNT_MISMATCH',
    cle.payment_id,
    cle.user_id,
    -p.total_amount,
    cle.amount
FROM credit_ledger_entries cle
JOIN payments p
    ON p.id = cle.payment_id
WHERE cle.deleted_at IS NULL
  AND cle.entry_type = 'payment'
  AND cle.amount <> -p.total_amount

UNION ALL

-- 7. 환불 원장 금액 ≠ +결제 총액 (환불은 결제당 한 번, 전액)
SELECT
    'REFUND_AMOUNT_MISMATCH',
    cle.payment_refund_id,
    cle.user_id,
    p.total_amount,
    cle.amount
FROM credit_ledger_entries cle
JOIN payment_refunds pr
    ON pr.id = cle.payment_refund_id
JOIN payments p
    ON p.id = pr.payment_id
WHERE cle.deleted_at IS NULL
  AND cle.entry_type = 'refund'
  AND cle.amount <> p.total_amount

UNION ALL

-- 8. 원장 항목 모양: 종류마다 부호 · 출처 컬럼이 맞는지
--    charge +, charge_request_id 만 / payment −, payment_id 만 / refund +, payment_refund_id 만
--    adjustment 0 아닌 값, adjusted_by_admin_id · reason 필수, 출처 없음
SELECT
    'LEDGER_ENTRY_SHAPE',
    id,
    user_id,
    NULL,
    NULL
FROM credit_ledger_entries
WHERE deleted_at IS NULL
  AND NOT (
      (
          entry_type = 'charge'
          AND amount > 0
          AND charge_request_id IS NOT NULL
          AND payment_id IS NULL
          AND payment_refund_id IS NULL
          AND adjusted_by_admin_id IS NULL
      )
      OR (
          entry_type = 'payment'
          AND amount < 0
          AND payment_id IS NOT NULL
          AND charge_request_id IS NULL
          AND payment_refund_id IS NULL
          AND adjusted_by_admin_id IS NULL
      )
      OR (
          entry_type = 'refund'
          AND amount > 0
          AND payment_refund_id IS NOT NULL
          AND charge_request_id IS NULL
          AND payment_id IS NULL
          AND adjusted_by_admin_id IS NULL
      )
      OR (
          entry_type = 'adjustment'
          AND amount <> 0
          AND adjusted_by_admin_id IS NOT NULL
          AND reason IS NOT NULL
          AND charge_request_id IS NULL
          AND payment_id IS NULL
          AND payment_refund_id IS NULL
      )
  )

UNION ALL

-- 9. 같은 사용자 · 같은 Idempotency-Key 결제가 2개 이상 (서버 규칙 10)
SELECT
    'DUPLICATE_PAYMENT_KEY',
    MIN(id),
    user_id,
    1,
    COUNT(*)
FROM payments
WHERE deleted_at IS NULL
GROUP BY user_id, idempotency_key
HAVING COUNT(*) > 1

UNION ALL

-- 10. 같은 사용자 · 같은 Idempotency-Key 충전 요청이 2개 이상 (서버 규칙 16)
SELECT
    'DUPLICATE_CHARGE_KEY',
    MIN(id),
    user_id,
    1,
    COUNT(*)
FROM charge_requests
WHERE deleted_at IS NULL
GROUP BY user_id, idempotency_key
HAVING COUNT(*) > 1

ORDER BY issue_type, source_id;
