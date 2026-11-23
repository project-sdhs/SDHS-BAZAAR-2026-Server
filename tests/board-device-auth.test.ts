import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { boardDeviceAuth } from '../src/middlewares/board-device-auth.js';
import { errorHandler } from '../src/middlewares/error-handler.js';

const repository = vi.hoisted(() => ({
  findByTokenHash: vi.fn(),
  touchLastSeen: vi.fn(),
}));

vi.mock('../src/repositories/board-device.repository.js', () => repository);

const token = 'bD9xR2vK7qL0mN4pS8tU1wY5zA3cE6fH9jG2kM7nP0Q';

function createTestApp() {
  const app = express();
  app.get('/boards/me', boardDeviceAuth, (_req, res) => {
    res.json(res.locals.boardDevice);
  });
  app.use(errorHandler);
  return app;
}

describe('boardDeviceAuth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('Bearer 토큰이 없거나 형식이 잘못되면 저장소를 조회하지 않고 401을 돌려준다', async () => {
    const app = createTestApp();

    const missing = await request(app).get('/boards/me');
    const malformed = await request(app).get('/boards/me').set('Authorization', 'Bearer invalid');

    expect(missing.status).toBe(401);
    expect(missing.body).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(malformed.status).toBe(401);
    expect(repository.findByTokenHash).not.toHaveBeenCalled();
  });

  it('저장된 기기가 없는 토큰을 거부한다', async () => {
    repository.findByTokenHash.mockResolvedValue(null);

    const res = await request(createTestApp())
      .get('/boards/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(repository.findByTokenHash).toHaveBeenCalledWith(
      '65c09ba2e77a6d131847bf3b8b55e3caa0b45209c02c1c38781a3a42998bd64f',
    );
    expect(repository.touchLastSeen).not.toHaveBeenCalled();
  });

  it('폐기된 기기는 BOARD_REPLACED로 거부한다', async () => {
    repository.findByTokenHash.mockResolvedValue({
      id: 8,
      boothId: 23,
      revokedAt: new Date(),
    });

    const res = await request(createTestApp())
      .get('/boards/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'BOARD_REPLACED' });
    expect(repository.touchLastSeen).not.toHaveBeenCalled();
  });

  it('유효한 기기 정보를 연결하고 마지막 확인 시각을 갱신한다', async () => {
    repository.findByTokenHash.mockResolvedValue({ id: 8, boothId: 23, revokedAt: null });
    repository.touchLastSeen.mockResolvedValue(undefined);

    const res = await request(createTestApp())
      .get('/boards/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 8, boothId: 23 });
    expect(repository.touchLastSeen).toHaveBeenCalledWith(8);
  });

  it('저장소 오류는 공통 500 응답으로 전달한다', async () => {
    repository.findByTokenHash.mockRejectedValue(new Error('database unavailable'));

    const res = await request(createTestApp())
      .get('/boards/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL' });
  });
});
