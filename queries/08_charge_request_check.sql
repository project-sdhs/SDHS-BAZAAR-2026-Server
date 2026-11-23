-- DB-16: 충전 요청 상태 · 입금 연결 검사
-- 조회 전용 · 정상이면 0행
--
-- status = approved ⇔ approved_at 있음, status = rejected ⇔ rejected_at 있음 (서버 규칙 19)
-- 승인된 요청은 은행 입금 1건과 연결되고, 입금 금액 = 요청 금액 (서버 규칙 20)

-- 1. 승인됐는데 연결된 입금이 없음
SELECT
    'APPROVED_WITHOUT_DEPOSIT' AS issue_type,
    cr.id AS charge_request_id,
    cr.user_id,
    NULL AS expected_value,
    NULL AS actual_value
FROM charge_requests cr
WHERE cr.deleted_at IS NULL
  AND cr.status = 'approved'
  AND cr.bank_deposit_id IS NULL

UNION ALL

-- 2. 연결된 입금 금액 ≠ 요청 금액
SELECT
    'DEPOSIT_AMOUNT_MISMATCH',
    cr.id,
    cr.user_id,
    cr.amount,
    bd.amount
FROM charge_requests cr
JOIN bank_deposits bd
    ON bd.id = cr.bank_deposit_id
WHERE cr.deleted_at IS NULL
  AND bd.amount <> cr.amount

UNION ALL

-- 3. 입금 1건이 충전 요청 2개 이상에 연결됨
SELECT
    'DEPOSIT_LINKED_TWICE',
    MIN(cr.id),
    MIN(cr.user_id),
    1,
    COUNT(*)
FROM charge_requests cr
WHERE cr.deleted_at IS NULL
  AND cr.bank_deposit_id IS NOT NULL
GROUP BY cr.bank_deposit_id
HAVING COUNT(*) > 1

UNION ALL

-- 4. status 와 approved_at · rejected_at 이 어긋남
SELECT
    'STATUS_TIME_MISMATCH',
    cr.id,
    cr.user_id,
    NULL,
    NULL
FROM charge_requests cr
WHERE cr.deleted_at IS NULL
  AND NOT (
      (cr.status = 'approved' AND cr.approved_at IS NOT NULL AND cr.rejected_at IS NULL)
      OR (cr.status = 'rejected' AND cr.rejected_at IS NOT NULL AND cr.approved_at IS NULL)
      OR (
          cr.status IN ('pending', 'needs_review')
          AND cr.approved_at IS NULL
          AND cr.rejected_at IS NULL
      )
  )

UNION ALL

-- 5. 한 사용자의 대기 중(pending) 충전 요청이 2개 이상
SELECT
    'MULTIPLE_PENDING_CHARGES',
    MIN(cr.id),
    cr.user_id,
    1,
    COUNT(*)
FROM charge_requests cr
WHERE cr.deleted_at IS NULL
  AND cr.status = 'pending'
GROUP BY cr.user_id
HAVING COUNT(*) > 1

ORDER BY issue_type, charge_request_id;
