import type { PoolConnection } from 'mysql2/promise';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPool } from '../src/db/pool.js';
import { findBoothOperation } from '../src/repositories/booth-operation.repository.js';

vi.mock('../src/db/pool.js', () => ({
  getPool: vi.fn(),
}));

const mockedGetPool = vi.mocked(getPool);

const poolExecute = vi.fn();
const connectionExecute = vi.fn();

const connection = {
  execute: connectionExecute,
} as unknown as PoolConnection;

const boothRow = {
  id: 1,
  name: '테스트 타코야끼',
  manual_status: 'open',
  ordering_paused: 1,
  paused_at: new Date('2027-11-20T03:00:00.000Z'),
  open_time: '10:00:00',
  close_time: '15:00:00',
};

describe('SRV-13 부스 운영 상태 DB 조회', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockedGetPool.mockReturnValue({
      execute: poolExecute,
    } as unknown as ReturnType<typeof getPool>);

    poolExecute.mockResolvedValue([[boothRow], []]);
    connectionExecute.mockResolvedValue([[boothRow], []]);
  });

  it('일반 조회에서는 FOR UPDATE를 사용하지 않는다', async () => {
    const result = await findBoothOperation(1);

    expect(poolExecute).toHaveBeenCalledOnce();

    const sql = String(poolExecute.mock.calls[0][0]);

    expect(sql).not.toMatch(/FOR UPDATE/i);
    expect(poolExecute.mock.calls[0][1]).toEqual([1]);

    expect(result).toMatchObject({
      id: 1,
      name: '테스트 타코야끼',
      orderingPaused: true,
      pausedAt: '2027-11-20T03:00:00.000Z',
    });
  });

  it('트랜잭션 연결을 전달하면 FOR UPDATE로 조회한다', async () => {
    const result = await findBoothOperation(1, connection);

    expect(connectionExecute).toHaveBeenCalledOnce();
    expect(poolExecute).not.toHaveBeenCalled();

    const sql = String(connectionExecute.mock.calls[0][0]);

    expect(sql).toMatch(/FOR UPDATE/i);
    expect(connectionExecute.mock.calls[0][1]).toEqual([1]);

    expect(result?.id).toBe(1);
  });

  it('존재하지 않는 부스는 null을 반환한다', async () => {
    poolExecute.mockResolvedValue([[], []]);

    const result = await findBoothOperation(999);

    expect(result).toBeNull();
  });

  it('잘못된 부스 ID는 DB 조회 전에 거부한다', async () => {
    await expect(findBoothOperation(0)).rejects.toThrow('부스 ID는 양의 정수여야 합니다.');

    expect(poolExecute).not.toHaveBeenCalled();
  });

  it('삭제된 부스는 조회 대상에서 제외한다', async () => {
    await findBoothOperation(1);

    const sql = String(poolExecute.mock.calls[0][0]);

    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
  });
});
