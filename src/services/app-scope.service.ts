import type { AppScope, BoothRole, OperatingBooth } from '../models/app-scope.model.js';
import type { User } from '../models/user.model.js';
import * as appScopeRepository from '../repositories/app-scope.repository.js';
import * as classTeacherRepository from '../repositories/class-teacher.repository.js';
import * as schoolMemberRepository from '../repositories/school-member.repository.js';

/** 한 부스에 역할이 여러 개면 이 순서로 하나만 남겨요. */
const BOOTH_ROLE_PRIORITY: readonly BoothRole[] = ['class_leader', 'teacher', 'cashier'];

/** 부스별로 가장 높은 역할 하나만 남기고 부스 id 순으로 정렬해요. */
function mergeBooths(booths: readonly OperatingBooth[]): OperatingBooth[] {
  const byBooth = new Map<number, BoothRole>();
  for (const { boothId, role } of booths) {
    const current = byBooth.get(boothId);
    if (
      current === undefined ||
      BOOTH_ROLE_PRIORITY.indexOf(role) < BOOTH_ROLE_PRIORITY.indexOf(current)
    ) {
      byBooth.set(boothId, role);
    }
  }
  return [...byBooth]
    .map(([boothId, role]) => ({ boothId, role }))
    .sort((a, b) => a.boothId - b.boothId);
}

/**
 * 회원의 역할 · 범위를 DB 에서 계산해요. (요청마다)
 * - 명부(school_members)에 없거나 삭제됐으면 visitor. 캐셔 지정은 명부와 상관없이 따로 봐요.
 * - 선생님: class_teachers 의 담당 반 → 그 반들의 부스를 teacher 로 운영
 * - 반장: 자기 반의 부스를 class_leader 로 운영
 * - 캐셔: booth_cashiers 에 지정된 부스를 cashier 로 운영
 */
export async function computeAppScope(user: User): Promise<AppScope> {
  const member =
    user.schoolMemberId === null
      ? null
      : await schoolMemberRepository.findById(user.schoolMemberId);

  const cashierBooths: OperatingBooth[] = (
    await appScopeRepository.findCashierBoothIds(user.id)
  ).map((boothId) => ({ boothId, role: 'cashier' }));

  if (!member) {
    return {
      role: 'visitor',
      schoolMemberId: null,
      classId: null,
      teacherClassIds: [],
      operatingBooths: mergeBooths(cashierBooths),
    };
  }

  if (member.memberType === 'teacher') {
    const teacherClassIds = [
      ...new Set(
        (await classTeacherRepository.findBySchoolMemberId(member.id)).map((row) => row.classId),
      ),
    ].sort((a, b) => a - b);
    const teacherBooths: OperatingBooth[] = (
      await appScopeRepository.findBoothsByClassIds(teacherClassIds)
    ).map(({ boothId }) => ({ boothId, role: 'teacher' }));

    return {
      role: 'teacher',
      schoolMemberId: member.id,
      classId: null,
      teacherClassIds,
      operatingBooths: mergeBooths([...teacherBooths, ...cashierBooths]),
    };
  }

  const isClassLeader = member.isClassLeader && member.classId !== null;
  const leaderBooths: OperatingBooth[] =
    isClassLeader && member.classId !== null
      ? (await appScopeRepository.findBoothsByClassIds([member.classId])).map(({ boothId }) => ({
          boothId,
          role: 'class_leader',
        }))
      : [];

  return {
    role: isClassLeader ? 'class_leader' : 'student',
    schoolMemberId: member.id,
    classId: member.classId,
    teacherClassIds: [],
    operatingBooths: mergeBooths([...leaderBooths, ...cashierBooths]),
  };
}

/** 이 부스를 (roles 중 하나로) 운영할 수 있는지 */
export function canOperateBooth(
  scope: AppScope,
  boothId: number,
  roles: readonly BoothRole[] = BOOTH_ROLE_PRIORITY,
): boolean {
  return scope.operatingBooths.some(
    (booth) => booth.boothId === boothId && roles.includes(booth.role),
  );
}

/** 이 반을 관리할 수 있는지 (그 반의 반장 · 담당 선생님) */
export function canManageClass(scope: AppScope, classId: number): boolean {
  return (
    (scope.role === 'class_leader' && scope.classId === classId) ||
    scope.teacherClassIds.includes(classId)
  );
}
