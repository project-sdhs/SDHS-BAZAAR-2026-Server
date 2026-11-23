
-- Google 그룹을 등록한 관리자
ALTER TABLE google_groups
ADD CONSTRAINT fk_google_groups_created_by_admin
FOREIGN KEY (created_by_admin_id)
REFERENCES admin_accounts(id)
ON DELETE RESTRICT;

-- Google 그룹 동기화를 실행한 관리자
ALTER TABLE google_group_sync_runs
ADD CONSTRAINT fk_sync_runs_started_by_admin
FOREIGN KEY (started_by_admin_id)
REFERENCES admin_accounts(id)
ON DELETE RESTRICT;

-- 학교 구성원을 수동으로 지정한 관리자
ALTER TABLE school_members
ADD CONSTRAINT fk_school_members_overridden_by_admin
FOREIGN KEY (overridden_by_admin_id)
REFERENCES admin_accounts(id)
ON DELETE RESTRICT;

-- 학생 인증을 처리한 관리자
ALTER TABLE users
ADD CONSTRAINT fk_users_verified_by_admin
FOREIGN KEY (verified_by_admin_id)
REFERENCES admin_accounts(id)
ON DELETE RESTRICT;
