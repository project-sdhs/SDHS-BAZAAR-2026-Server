-- 앱 버전 · 강제 업데이트 여부
-- 가장 최근에 넣은 줄(id가 가장 큰 줄)이 지금 앱 버전이에요.
--
-- 적용: mysql -h 127.0.0.1 -P 3306 -u bazaar -p sdhs_bazaar < db/app_versions.sql
CREATE TABLE IF NOT EXISTS app_versions (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version      VARCHAR(20)     NOT NULL,               -- 예: '1.2.0'
  force_update BOOLEAN         NOT NULL DEFAULT FALSE, -- TRUE면 이 버전보다 낮은 앱은 업데이트해야 써요
  created_at   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);
