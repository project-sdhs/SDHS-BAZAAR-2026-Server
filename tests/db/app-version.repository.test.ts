import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getPool } from '../../src/db/pool.js';
import * as appVersionRepository from '../../src/repositories/app-version.repository.js';

// 실제 MySQL에서 저장소의 SQL이 맞게 도는지 확인해요. (가짜 저장소로는 SQL 오타를 못 잡아요)
describe('app-version.repository (실제 DB)', () => {
  beforeEach(async () => {
    await getPool().query('DELETE FROM app_versions');
  });

  afterAll(async () => {
    await closePool();
  });

  it('insert 한 값을 findById 로 읽으면 API 모양(camelCase · boolean · ISO 시각)으로 온다', async () => {
    const before = Date.now();
    const id = await appVersionRepository.insert({ version: '1.0.0', forceUpdate: true });

    const found = await appVersionRepository.findById(id);

    expect(found).toEqual({
      id,
      version: '1.0.0',
      forceUpdate: true,
      createdAt: expect.any(String) as string,
      updatedAt: expect.any(String) as string,
    });
    // UTC로 저장 · 읽기가 맞으면 지금 시각과 몇 초 차이 안 나요. (시간대가 틀리면 9시간 차이)
    expect(Math.abs(new Date(found!.createdAt).getTime() - before)).toBeLessThan(5000);
  });

  it('BOOLEAN false 는 false 로 온다', async () => {
    const id = await appVersionRepository.insert({ version: '1.0.0', forceUpdate: false });

    expect((await appVersionRepository.findById(id))?.forceUpdate).toBe(false);
  });

  it('findAll 은 최근 순, findLatest 는 가장 최근 것, 없으면 null', async () => {
    expect(await appVersionRepository.findLatest()).toBeNull();

    await appVersionRepository.insert({ version: '1.0.0', forceUpdate: false });
    await appVersionRepository.insert({ version: '1.1.0', forceUpdate: true });

    expect((await appVersionRepository.findAll()).map((row) => row.version)).toEqual([
      '1.1.0',
      '1.0.0',
    ]);
    expect(await appVersionRepository.findLatest()).toMatchObject({ version: '1.1.0' });
  });

  it('findByVersion 은 같은 버전을 찾고, 없으면 null', async () => {
    await appVersionRepository.insert({ version: '1.0.0', forceUpdate: false });

    expect(await appVersionRepository.findByVersion('1.0.0')).toMatchObject({ version: '1.0.0' });
    expect(await appVersionRepository.findByVersion('9.9.9')).toBeNull();
    expect(await appVersionRepository.findById(999_999)).toBeNull();
  });

  it('update 는 값을 바꾸고 updated_at 도 MySQL이 바꾼다', async () => {
    const id = await appVersionRepository.insert({ version: '1.0.0', forceUpdate: false });
    const before = await appVersionRepository.findById(id);
    await new Promise((resolve) => setTimeout(resolve, 20));

    await appVersionRepository.update(id, { version: '1.0.1', forceUpdate: true });
    const after = await appVersionRepository.findById(id);

    expect(after).toMatchObject({ version: '1.0.1', forceUpdate: true });
    expect(after!.updatedAt > before!.updatedAt).toBe(true);
  });
});
