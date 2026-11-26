/**
 * 앱 회원의 역할 · 범위 (SRV-08). 토큰에 넣지 않고 요청마다 DB 에서 다시 계산해요.
 * 그래서 반장 · 캐셔 · 담당 반이 바뀌면 다음 요청부터 바로 반영돼요.
 */

/**
 * 회원 역할 (API 문서 GET /users/me 의 role)
 * - visitor: 학교 명부에 없는 회원 (방문객 · 외부 계정)
 * - student: 학생
 * - class_leader: 반장 (자기 반 · 자기 반 부스)
 * - teacher: 선생님 (담당 반 · 담당 반 부스)
 */
export type AppRole = 'visitor' | 'student' | 'class_leader' | 'teacher';

/** 부스에서 맡은 일 (API 문서 operatingBooths[].role) */
export type BoothRole = 'class_leader' | 'cashier' | 'teacher';

export interface OperatingBooth {
  boothId: number;
  role: BoothRole;
}

export interface AppScope {
  role: AppRole;
  /** school_members.id (명부에 없으면 null) */
  schoolMemberId: number | null;
  /** 학생 · 반장의 반 (선생님 · 방문객은 null) */
  classId: number | null;
  /** 선생님이 담당하는 반 */
  teacherClassIds: number[];
  /** 운영할 수 있는 부스와 그 부스에서의 역할 (부스당 하나, 반장 > 선생님 > 캐셔 순) */
  operatingBooths: OperatingBooth[];
}
