import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface TableRow extends RowDataPacket {
  TABLE_NAME: string;
}

interface ForeignKeyRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
}

describe('DB-06 Map Schema', () => {
  it('지도 관련 테이블 4개가 존재한다', async () => {
    const [rows] = await getPool().execute<TableRow[]>(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'buildings',
           'floors',
           'zones',
           'booth_locations'
         )`,
    );

    const names = rows.map((row) => row.TABLE_NAME);

    expect(names.sort()).toEqual(['buildings', 'floors', 'zones', 'booth_locations'].sort());
  });

  it('외래 키 5개가 올바르게 연결되어 있다', async () => {
    const [rows] = await getPool().execute<ForeignKeyRow[]>(
      `SELECT
         TABLE_NAME,
         COLUMN_NAME,
         REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'buildings',
           'floors',
           'zones',
           'booth_locations'
         )
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );

    const actual = rows.map(
      (row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}->${row.REFERENCED_TABLE_NAME}`,
    );

    expect(actual.sort()).toEqual(
      [
        'floors.building_id->buildings',
        'zones.floor_id->floors',
        'booth_locations.booth_id->booths',
        'booth_locations.floor_id->floors',
        'booth_locations.zone_id->zones',
      ].sort(),
    );
  });

  it('지도 좌표와 층 크기의 CHECK 제약조건이 존재한다', async () => {
    const [rows] = await getPool().execute<
      (RowDataPacket & {
        TABLE_NAME: string;
        CHECK_CLAUSE: string;
      })[]
    >(
      `SELECT
         tc.TABLE_NAME,
         cc.CHECK_CLAUSE
       FROM information_schema.TABLE_CONSTRAINTS tc
       JOIN information_schema.CHECK_CONSTRAINTS cc
         ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
        AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
       WHERE tc.TABLE_SCHEMA = DATABASE()
         AND tc.TABLE_NAME IN ('floors', 'booth_locations')
         AND tc.CONSTRAINT_TYPE = 'CHECK'`,
    );

    const clauses = rows.map((row) => row.CHECK_CLAUSE.toLowerCase()).join(' ');

    expect(clauses).toContain('width_m');
    expect(clauses).toContain('height_m');
    expect(clauses).toContain('x');
    expect(clauses).toContain('y');
  });
});
