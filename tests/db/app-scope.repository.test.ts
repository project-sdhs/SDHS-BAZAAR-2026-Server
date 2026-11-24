import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { afterAll, describe, expect, it } from 'vitest';

import { closePool, getPool } from '../../src/db/pool.js';
import {
  findBoothsByClassIds,
  findCashierBoothIds,
} from '../../src/repositories/app-scope.repository.js';

interface IdRow extends RowDataPacket {
  id: number;
}

describe('app-scope repository (DB)', () => {
  afterAll(async () => {
    await closePool();
  });

  it('반의 부스 · 캐셔 부스를 찾고, 삭제된 부스 · 취소된 캐셔 지정은 뺀다', async () => {
    const pool = getPool();
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const boothIds: number[] = [];
    let userId: number | null = null;

    try {
      // 012 마이그레이션이 넣어 둔 반 하나
      const [classes] = await pool.query<IdRow[]>('SELECT id FROM classes ORDER BY id LIMIT 1');
      const classId = classes[0].id;

      const [user] = await pool.execute<ResultSetHeader>(
        'INSERT INTO users (auth_provider, auth_subject) VALUES (?, ?)',
        ['google', `scope-${unique}`],
      );
      userId = user.insertId;

      // 부스 2개: 하나는 살아 있고, 하나는 삭제
      for (const deleted of [false, true]) {
        const [booth] = await pool.execute<ResultSetHeader>(
          `INSERT INTO booths (class_id, name, open_time, close_time, booth_code, deleted_at)
           VALUES (?, ?, '10:00:00', '15:00:00', ?, ?)`,
          [
            classId,
            `범위 테스트 ${deleted ? '삭제' : '운영'}`,
            String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0'),
            deleted ? new Date() : null,
          ],
        );
        boothIds.push(booth.insertId);
      }
      const [liveBoothId, deletedBoothId] = boothIds;

      // 캐셔 지정: 살아 있는 부스(유효) · 살아 있는 부스(취소됨) · 삭제된 부스
      await pool.execute(
        `INSERT INTO booth_cashiers (booth_id, user_id, deleted_at)
         VALUES (?, ?, NULL), (?, ?, CURRENT_TIMESTAMP(3)), (?, ?, NULL)`,
        [liveBoothId, userId, liveBoothId, userId, deletedBoothId, userId],
      );

      const classBooths = await findBoothsByClassIds([classId]);
      expect(classBooths).toContainEqual({ boothId: liveBoothId, classId });
      expect(classBooths.map((booth) => booth.boothId)).not.toContain(deletedBoothId);

      expect(await findCashierBoothIds(userId)).toEqual([liveBoothId]);
      expect(await findBoothsByClassIds([])).toEqual([]);
    } finally {
      if (userId !== null) {
        await pool.execute('DELETE FROM booth_cashiers WHERE user_id = ?', [userId]);
      }
      for (const boothId of boothIds) {
        await pool.execute('DELETE FROM booths WHERE id = ?', [boothId]);
      }
      if (userId !== null) {
        await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
      }
    }
  });
});
