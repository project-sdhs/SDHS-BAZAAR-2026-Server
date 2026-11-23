import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';
import type { GoogleGroup } from '../models/google-group.model.js';

interface GoogleGroupRow extends RowDataPacket {
  id: number;
  group_email: string;
  group_type: 'class' | 'teacher';
  class_id: number | null;
  display_name: string | null;
  created_by_admin_id: number | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function toGoogleGroup(row: GoogleGroupRow): GoogleGroup {
  return {
    id: row.id,
    groupEmail: row.group_email,
    groupType: row.group_type,
    classId: row.class_id,
    displayName: row.display_name,
    createdByAdminId: row.created_by_admin_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

// 전체 활성 그룹 조회
export async function findAll(): Promise<GoogleGroup[]> {
  const [rows] = await getPool().execute<GoogleGroupRow[]>(
    `SELECT *
     FROM google_groups
     WHERE deleted_at IS NULL
     ORDER BY id`,
  );

  return rows.map(toGoogleGroup);
}

// ID로 그룹 하나 조회
export async function findById(id: number): Promise<GoogleGroup | null> {
  const [rows] = await getPool().execute<GoogleGroupRow[]>(
    `SELECT *
     FROM google_groups
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );

  return rows.length > 0 ? toGoogleGroup(rows[0]) : null;
}
