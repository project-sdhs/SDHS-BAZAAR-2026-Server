import express, { type RequestHandler, type Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppAuthLocals } from '../src/middlewares/app-auth.js';
import {
  loadAppScope,
  requireBoothRole,
  requireClassRole,
  type AppScopeLocals,
} from '../src/middlewares/app-scope.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import type { AppScope } from '../src/models/app-scope.model.js';
import type { SchoolMember } from '../src/models/school-member.model.js';
import type { User } from '../src/models/user.model.js';
import {
  canManageClass,
  canOperateBooth,
  computeAppScope,
} from '../src/services/app-scope.service.js';

// CI에는 MySQL이 없어서 저장소들을 가짜로 바꿔서 테스트해요.
const members = vi.hoisted(() => ({ findById: vi.fn() }));
const classTeachers = vi.hoisted(() => ({ findBySchoolMemberId: vi.fn() }));
const scopes = vi.hoisted(() => ({
  findBoothsByClassIds: vi.fn(),
  findCashierBoothIds: vi.fn(),
}));
vi.mock('../src/repositories/school-member.repository.js', () => members);
vi.mock('../src/repositories/class-teacher.repository.js', () => classTeachers);
vi.mock('../src/repositories/app-scope.repository.js', () => scopes);

/** 반 → 부스 (8반: 23번 부스, 9반: 31 · 32번 부스) */
const CLASS_BOOTHS: Record<number, number[]> = { 8: [23], 9: [31, 32] };

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1042,
    authProvider: 'google',
    authSubject: 'google-1042',
    email: 'student@example.com',
    googleHostedDomain: null,
    name: '테스트',
    schoolMemberId: 500,
    verifiedAt: null,
    verifiedByUserId: null,
    verifiedByAdminId: null,
    depositCode: null,
    creditBalance: 0,
    lastLoginAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function makeMember(overrides: Partial<SchoolMember> = {}): SchoolMember {
  return {
    id: 500,
    email: 'student@example.com',
    name: '테스트',
    memberType: 'student',
    classId: 8,
    studentNo: '2205',
    isClassLeader: false,
    source: 'manual',
    googleGroupId: null,
    lastSyncRunId: null,
    overriddenByAdminId: null,
    overriddenAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  members.findById.mockResolvedValue(makeMember());
  classTeachers.findBySchoolMemberId.mockResolvedValue([]);
  scopes.findCashierBoothIds.mockResolvedValue([]);
  scopes.findBoothsByClassIds.mockImplementation((classIds: number[]) =>
    Promise.resolve(
      classIds.flatMap((classId) =>
        (CLASS_BOOTHS[classId] ?? []).map((boothId) => ({ boothId, classId })),
      ),
    ),
  );
});

describe('computeAppScope', () => {
  it('명부에 없는 회원은 visitor 이고 운영 부스가 없다', async () => {
    const scope = await computeAppScope(makeUser({ schoolMemberId: null }));

    expect(scope).toEqual({
      role: 'visitor',
      schoolMemberId: null,
      classId: null,
      teacherClassIds: [],
      operatingBooths: [],
    });
    expect(members.findById).not.toHaveBeenCalled();
  });

  it('명부에서 삭제된 회원(findById → null)도 visitor', async () => {
    members.findById.mockResolvedValue(null);

    expect(await computeAppScope(makeUser())).toMatchObject({ role: 'visitor', classId: null });
  });

  it('일반 학생은 student 이고 자기 반만 갖는다 (반 부스는 운영 못 함)', async () => {
    const scope = await computeAppScope(makeUser());

    expect(scope).toEqual({
      role: 'student',
      schoolMemberId: 500,
      classId: 8,
      teacherClassIds: [],
      operatingBooths: [],
    });
    expect(scopes.findBoothsByClassIds).not.toHaveBeenCalled();
  });

  it('반장은 자기 반 부스를 class_leader 로 운영한다', async () => {
    members.findById.mockResolvedValue(makeMember({ isClassLeader: true }));

    const scope = await computeAppScope(makeUser());

    expect(scope).toMatchObject({
      role: 'class_leader',
      classId: 8,
      operatingBooths: [{ boothId: 23, role: 'class_leader' }],
    });
    expect(scopes.findBoothsByClassIds).toHaveBeenCalledWith([8]);
  });

  it('캐셔 지정은 명부와 상관없이 그 부스만 cashier 로 운영한다 (방문객 · 학생 모두)', async () => {
    scopes.findCashierBoothIds.mockResolvedValue([31]);

    const visitor = await computeAppScope(makeUser({ schoolMemberId: null }));
    const student = await computeAppScope(makeUser());

    for (const scope of [visitor, student]) {
      expect(scope.operatingBooths).toEqual([{ boothId: 31, role: 'cashier' }]);
    }
    expect(scopes.findCashierBoothIds).toHaveBeenCalledWith(1042);
  });

  it('한 부스에 역할이 겹치면 반장이 이기고, 부스 id 순으로 정렬한다', async () => {
    members.findById.mockResolvedValue(makeMember({ isClassLeader: true }));
    scopes.findCashierBoothIds.mockResolvedValue([32, 23]);

    const scope = await computeAppScope(makeUser());

    expect(scope.operatingBooths).toEqual([
      { boothId: 23, role: 'class_leader' },
      { boothId: 32, role: 'cashier' },
    ]);
  });

  it('선생님은 담당 반(중복 제거 · 정렬)과 그 반들의 부스를 teacher 로 갖는다', async () => {
    members.findById.mockResolvedValue(makeMember({ memberType: 'teacher', classId: null }));
    classTeachers.findBySchoolMemberId.mockResolvedValue([
      { classId: 9 },
      { classId: 8 },
      { classId: 9 },
    ]);

    const scope = await computeAppScope(makeUser());

    expect(scope).toEqual({
      role: 'teacher',
      schoolMemberId: 500,
      classId: null,
      teacherClassIds: [8, 9],
      operatingBooths: [
        { boothId: 23, role: 'teacher' },
        { boothId: 31, role: 'teacher' },
        { boothId: 32, role: 'teacher' },
      ],
    });
    expect(classTeachers.findBySchoolMemberId).toHaveBeenCalledWith(500);
  });

  it('반이 없는 반장 표시는 반장으로 보지 않는다', async () => {
    members.findById.mockResolvedValue(makeMember({ isClassLeader: true, classId: null }));

    expect(await computeAppScope(makeUser())).toMatchObject({
      role: 'student',
      operatingBooths: [],
    });
  });
});

describe('canOperateBooth · canManageClass', () => {
  const leader: AppScope = {
    role: 'class_leader',
    schoolMemberId: 500,
    classId: 8,
    teacherClassIds: [],
    operatingBooths: [
      { boothId: 23, role: 'class_leader' },
      { boothId: 32, role: 'cashier' },
    ],
  };

  it('운영 부스만, roles 를 주면 그 역할만 허용한다', () => {
    expect(canOperateBooth(leader, 23)).toBe(true);
    expect(canOperateBooth(leader, 32)).toBe(true);
    expect(canOperateBooth(leader, 99)).toBe(false);
    expect(canOperateBooth(leader, 32, ['class_leader', 'teacher'])).toBe(false);
  });

  it('반은 그 반 반장 · 담당 선생님만 관리한다', () => {
    const teacher: AppScope = { ...leader, role: 'teacher', classId: null, teacherClassIds: [9] };
    const student: AppScope = { ...leader, role: 'student' };

    expect(canManageClass(leader, 8)).toBe(true);
    expect(canManageClass(leader, 9)).toBe(false);
    expect(canManageClass(teacher, 9)).toBe(true);
    expect(canManageClass(student, 8)).toBe(false);
  });
});

describe('loadAppScope · requireBoothRole · requireClassRole', () => {
  /** requireAppAuth 대신: 테스트용으로 로그인한 회원을 res.locals.auth 에 넣어요. */
  const fakeAuth: RequestHandler<ParamsDictionary, unknown, unknown, ParsedQs, AppAuthLocals> = (
    _req,
    res,
    next,
  ) => {
    const user = makeUser();
    res.locals.auth = { userId: user.id, user };
    next();
  };

  function appWithScope() {
    const app = express();
    const ok = (_req: express.Request, res: Response<{ role: string }, AppScopeLocals>) => {
      res.json({ role: res.locals.scope.role });
    };
    app.get('/me/scope', fakeAuth, loadAppScope, ok);
    app.patch('/booths/:boothId/pause', fakeAuth, loadAppScope, requireBoothRole(), ok);
    app.put(
      '/booths/:boothId/cashiers',
      fakeAuth,
      loadAppScope,
      requireBoothRole('boothId', ['class_leader', 'teacher']),
      ok,
    );
    app.get('/classes/:classId/members', fakeAuth, loadAppScope, requireClassRole(), ok);
    app.use(errorHandler);
    return app;
  }

  it('요청마다 역할을 계산해서 res.locals.scope 에 담는다', async () => {
    const first = await request(appWithScope()).get('/me/scope');
    members.findById.mockResolvedValue(makeMember({ isClassLeader: true }));
    const second = await request(appWithScope()).get('/me/scope');

    expect(first.body).toEqual({ role: 'student' });
    expect(second.body).toEqual({ role: 'class_leader' });
    expect(members.findById).toHaveBeenCalledTimes(2);
  });

  it('운영하는 부스면 통과, 아니면 403 FORBIDDEN', async () => {
    members.findById.mockResolvedValue(makeMember({ isClassLeader: true }));

    const own = await request(appWithScope()).patch('/booths/23/pause');
    const other = await request(appWithScope()).patch('/booths/31/pause');

    expect(own.status).toBe(200);
    expect(other.status).toBe(403);
    expect(other.body).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('역할을 정하면 캐셔는 막힌다 (캐셔 지정은 반장 · 선생님만)', async () => {
    scopes.findCashierBoothIds.mockResolvedValue([31]);

    const pause = await request(appWithScope()).patch('/booths/31/pause');
    const assign = await request(appWithScope()).put('/booths/31/cashiers');

    expect(pause.status).toBe(200);
    expect(assign.status).toBe(403);
  });

  it('반은 그 반 반장 · 담당 선생님만 통과한다', async () => {
    const student = await request(appWithScope()).get('/classes/8/members');

    members.findById.mockResolvedValue(makeMember({ isClassLeader: true }));
    const leader = await request(appWithScope()).get('/classes/8/members');
    const otherClass = await request(appWithScope()).get('/classes/9/members');

    expect(student.status).toBe(403);
    expect(leader.status).toBe(200);
    expect(otherClass.status).toBe(403);
  });

  it('경로의 id 가 양의 정수가 아니면 400 VALIDATION_FAILED', async () => {
    for (const id of ['abc', '0', '-1', '1.5']) {
      const res = await request(appWithScope()).patch(`/booths/${id}/pause`);
      expect(res.status, id).toBe(400);
      expect(res.body, id).toMatchObject({
        code: 'VALIDATION_FAILED',
        fields: { boothId: expect.any(String) as string },
      });
    }
  });

  it('DB 오류는 공통 500 INTERNAL 로 전달한다', async () => {
    members.findById.mockRejectedValue(new Error('database unavailable'));

    const res = await request(appWithScope()).get('/me/scope');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL' });
  });
});
