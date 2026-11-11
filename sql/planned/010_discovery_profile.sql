-- DRAFT / QA ONLY. Additive Profile presentation; no Blog/006/008 dependency.
-- DDL auto-commits. Stop on error; do not rerun a partial migration.
ALTER TABLE users
  ADD COLUMN profile_cover_file VARCHAR(80) NULL,
  ADD CONSTRAINT ck_users_profile_cover CHECK (profile_cover_file IS NULL OR profile_cover_file REGEXP '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}[.]webp$');
CREATE TABLE profile_schema_state (
  singleton_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  migration_version INT UNSIGNED NOT NULL,
  application_revision INT UNSIGNED NOT NULL,
  completed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT ck_profile_schema_state CHECK (singleton_id=1 AND migration_version=10 AND application_revision=1)
) ENGINE=InnoDB;
START TRANSACTION;
INSERT INTO profile_schema_state(singleton_id,migration_version,application_revision) VALUES(1,10,1);
COMMIT;
