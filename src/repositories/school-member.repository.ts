import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';
import type {
  SchoolMember,
  SchoolMemberSource,
  SchoolMemberType,
} from '../models/school-member.model.js';

interface SchoolMemberRow extends RowDataPacket {
  id: number;
  email: string;
  name: string | null;
  member_type: SchoolMemberType;
  class_id: number | null;
  student_no: string | null;
  is_class_leader: number;
  source: SchoolMemberSource;
  google_group_id: number | null;
  last_sync_run_id: number | null;
  overridden_by_admin_id: number | null;
  overridden_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function toSchoolMember(row: SchoolMemberRow): SchoolMember {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    memberType: row.member_type,
    classId: row.class_id,
    studentNo: row.student_no,
    isClassLeader: row.is_class_leader === 1,
    source: row.source,
    googleGroupId: row.google_group_id,
    lastSyncRunId: row.last_sync_run_id,
    overriddenByAdminId: row.overridden_by_admin_id,
    overriddenAt: row.overridden_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

// 삭제되지 않은 학교 구성원 전체 조회
export async function findAll(): Promise<SchoolMember[]> {
  const [rows] = await getPool().execute<SchoolMemberRow[]>(
    `SELECT *
     FROM school_members
     WHERE deleted_at IS NULL
     ORDER BY id`,
  );

  return rows.map(toSchoolMember);
}

// ID로 학교 구성원 조회
export async function findById(id: number): Promise<SchoolMember | null> {
  const [rows] = await getPool().execute<SchoolMemberRow[]>(
    `SELECT *
     FROM school_members
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );

  return rows.length > 0 ? toSchoolMember(rows[0]) : null;
}

// 학교 이메일로 구성원 조회
export async function findByEmail(email: string): Promise<SchoolMember | null> {
  const [rows] = await getPool().execute<SchoolMemberRow[]>(
    `SELECT *
     FROM school_members
     WHERE email = ? AND deleted_at IS NULL
     LIMIT 1`,
    [email.toLowerCase()],
  );

  return rows.length > 0 ? toSchoolMember(rows[0]) : null;
}
