import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface SettingsRow extends RowDataPacket {
  event_name: string;
  event_start_date: Date;
  event_end_date: Date;
  depositor_name_rule: string;
  depositor_name_rule_with_code: string;
  charge_min: number;
  charge_max: number | null;
  balance_limit: number | null;
  deposit_account_id: number | null;
  updated_by_admin_id: number | null;
  app_open: number;
}

describe('DB-10 Bazaar Settings Seed', () => {
  it('활성 바자회 설정 행이 정확히 1개 존재한다', async () => {
    const [rows] = await getPool().query<SettingsRow[]>(`
      SELECT *
      FROM bazaar_settings
      WHERE deleted_at IS NULL
    `);

    expect(rows).toHaveLength(1);
  });

  it('기본 설정값이 올바르게 저장되어 있다', async () => {
    const [rows] = await getPool().query<SettingsRow[]>(`
      SELECT *
      FROM bazaar_settings
      WHERE deleted_at IS NULL
    `);

    expect(rows).toHaveLength(1);

    const settings = rows[0];

    expect(settings.depositor_name_rule).toBe('{studentNo} {name}');

    expect(settings.depositor_name_rule_with_code).toBe('{depositCode} {name}');

    expect(settings.charge_min).toBe(1000);
    expect(settings.charge_max).toBeNull();
    expect(settings.balance_limit).toBeNull();

    expect(settings.deposit_account_id).toBeNull();
    expect(settings.updated_by_admin_id).toBeNull();

    expect(settings.app_open).toBe(0);
  });
});
