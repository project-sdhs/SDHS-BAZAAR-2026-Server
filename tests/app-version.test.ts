import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { AppVersion } from '../src/models/app-version.model.js';

// CI에는 MySQL이 없어서, 저장소(repository)를 메모리 배열로 동작하는 가짜로 바꿔서 테스트해요.
// 진짜 DB와 같은 함수 이름 · 같은 반환 모양이면 서비스 · 컨트롤러는 차이를 몰라요.
const fakeRepository = vi.hoisted(() => {
  let rows: AppVersion[] = [];
  let nextId = 1;
  const copy = (row: AppVersion | undefined) => Promise.resolve(row ? { ...row } : null);

  return {
    reset() {
      rows = [];
      nextId = 1;
    },
    findAll: () => Promise.resolve([...rows].reverse().map((row) => ({ ...row }))),
    findLatest: () => copy(rows.at(-1)),
    findById: (id: number) => copy(rows.find((row) => row.id === id)),
    findByVersion: (version: string) => copy(rows.find((row) => row.version === version)),
    insert(values: { version: string; forceUpdate: boolean }) {
      const now = new Date().toISOString();
      rows.push({ id: nextId, ...values, createdAt: now, updatedAt: now });
      return Promise.resolve(nextId++);
    },
    update(id: number, values: { version: string; forceUpdate: boolean }) {
      const row = rows.find((item) => item.id === id);
      if (row) {
        Object.assign(row, values, { updatedAt: new Date().toISOString() });
      }
      return Promise.resolve();
    },
  };
});

vi.mock('../src/repositories/app-version.repository.js', () => fakeRepository);

const app = createApp();

describe('앱 버전 API', () => {
  beforeEach(() => {
    fakeRepository.reset();
  });

  it('등록된 버전이 없으면 GET /app-versions/latest 는 404', async () => {
    const res = await request(app).get('/app-versions/latest');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('POST 로 등록하면 201 과 등록한 버전을 돌려준다 (forceUpdate 기본값 false)', async () => {
    const res = await request(app).post('/app-versions').send({ version: '1.0.0' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 1,
      version: '1.0.0',
      forceUpdate: false,
      createdAt: expect.any(String) as string,
      updatedAt: expect.any(String) as string,
    });
  });

  it('목록은 최근 순, latest 는 가장 최근에 등록한 버전', async () => {
    await request(app).post('/app-versions').send({ version: '1.0.0' });
    await request(app).post('/app-versions').send({ version: '1.1.0', forceUpdate: true });

    const list = await request(app).get('/app-versions');
    expect(list.status).toBe(200);
    expect((list.body as { items: AppVersion[] }).items.map((item) => item.version)).toEqual([
      '1.1.0',
      '1.0.0',
    ]);

    const latest = await request(app).get('/app-versions/latest');
    expect(latest.status).toBe(200);
    expect(latest.body).toMatchObject({ id: 2, version: '1.1.0', forceUpdate: true });
  });

  it('GET /app-versions/:id 는 그 버전, 없으면 404, 숫자가 아니면 400', async () => {
    await request(app).post('/app-versions').send({ version: '1.0.0' });

    expect((await request(app).get('/app-versions/1')).body).toMatchObject({ version: '1.0.0' });
    expect((await request(app).get('/app-versions/99')).status).toBe(404);

    const bad = await request(app).get('/app-versions/abc');
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('잘못된 본문은 400 VALIDATION_FAILED', async () => {
    const cases = [
      {},
      { version: '1.2' },
      { version: 120 },
      { version: '1.0.0', forceUpdate: 'yes' },
    ];

    for (const body of cases) {
      const res = await request(app).post('/app-versions').send(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: 'VALIDATION_FAILED',
        message: expect.any(String) as string,
      });
    }
  });

  it('이미 있는 버전을 다시 등록하면 409 CONFLICT', async () => {
    await request(app).post('/app-versions').send({ version: '1.0.0' });

    const res = await request(app).post('/app-versions').send({ version: '1.0.0' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CONFLICT' });
  });

  it('PATCH 는 보낸 값만 바꾼다', async () => {
    await request(app).post('/app-versions').send({ version: '1.0.0' });

    const res = await request(app).patch('/app-versions/1').send({ forceUpdate: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, version: '1.0.0', forceUpdate: true });
  });

  it('PATCH: 빈 본문은 400, 없는 id 는 404, 다른 줄과 같은 버전은 409', async () => {
    await request(app).post('/app-versions').send({ version: '1.0.0' });
    await request(app).post('/app-versions').send({ version: '1.1.0' });

    expect((await request(app).patch('/app-versions/1').send({})).status).toBe(400);
    expect((await request(app).patch('/app-versions/99').send({ forceUpdate: true })).status).toBe(
      404,
    );
    expect((await request(app).patch('/app-versions/1').send({ version: '1.1.0' })).status).toBe(
      409,
    );
  });
});
