import { afterAll, describe, expect, it } from 'vitest';
import type { ResultSetHeader } from 'mysql2';

import { getPool } from '../../src/db/pool.js';
import { findAll, findById } from '../../src/repositories/class.repository.js';

// 테스트가 생성한 데이터의 ID만 보관
const createdIds: number[] = [];

afterAll(async () => {
  // 테스트가 직접 만든 데이터만 정리
  for (const id of createdIds) {
    await getPool().execute('DELETE FROM classes WHERE id = ?', [id]);
  }
});

describe('Class Repository DB 테스트', () => {
  it('전체 조회 결과는 배열이어야 한다', async () => {
    const result = await findAll();

    expect(Array.isArray(result)).toBe(true);
  });

  it('존재하지 않는 반 ID는 null을 반환한다', async () => {
    const result = await findById(-1);

    expect(result).toBeNull();
  });

  it('INSERT한 반을 ID로 조회할 수 있다', async () => {
    // 1. 테스트 데이터 추가
    const [insertResult] = await getPool().execute<ResultSetHeader>(
      `INSERT INTO classes (grade, class_no)
         VALUES (?, ?)`,
      [2, 99],
    );

    const id = insertResult.insertId;
    createdIds.push(id);

    // 2. Repository를 이용해 조회
    const result = await findById(id);

    // 3. 결과 검증
    expect(result).not.toBeNull();
    expect(result?.id).toBe(id);
    expect(result?.grade).toBe(2);
    expect(result?.classNo).toBe(99);
    expect(result?.deletedAt).toBeNull();

    expect(result?.createdAt).toBeTruthy();
    expect(result?.updatedAt).toBeTruthy();
  });

  it('Soft Delete된 반은 조회되지 않는다', async () => {
    // 1. 테스트 데이터 추가
    const [insertResult] = await getPool().execute<ResultSetHeader>(
      `INSERT INTO classes (grade, class_no)
         VALUES (?, ?)`,
      [3, 99],
    );

    const id = insertResult.insertId;
    createdIds.push(id);

    // 2. Soft Delete
    await getPool().execute(
      `UPDATE classes
       SET deleted_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [id],
    );

    // 3. 일반 조회에서 제외되는지 확인
    const result = await findById(id);

    expect(result).toBeNull();
  });
});
