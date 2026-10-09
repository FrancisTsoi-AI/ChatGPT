-- Home Base schema. Run once in phpMyAdmin (Import tab, or paste into SQL tab)
-- on the empty database you created for Home Base. Safe to re-run: it only
-- creates tables that do not exist yet and never drops anything.
--
-- Every table except `settings` has: id, created_at, updated_at and deleted_at
-- (deleted_at set = the row is in the trash; it is purged for good after 30 days).
-- All times are stored in UTC.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS scenarios (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(80)  NOT NULL,
  position    INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per tile on a scenario's grid. type: toolbox | todo | thoughts |
-- clock | files | countdown | music. x/y/width/height are grid cells on the
-- 12-column grid. `settings` holds JSON (to-do buckets, countdown dates, view
-- mode, shared_from, mobile order ...).
CREATE TABLE IF NOT EXISTS tiles (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  scenario_id  INT UNSIGNED NOT NULL,
  type         VARCHAR(20)  NOT NULL,
  x            SMALLINT     NOT NULL DEFAULT 0,
  y            SMALLINT     NOT NULL DEFAULT 0,
  width        SMALLINT     NOT NULL DEFAULT 4,
  height       SMALLINT     NOT NULL DEFAULT 4,
  title        VARCHAR(120) NOT NULL DEFAULT '',
  colour       VARCHAR(20)  NOT NULL DEFAULT '',
  settings     TEXT         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at   DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_tiles_scenario (scenario_id),
  CONSTRAINT fk_tiles_scenario FOREIGN KEY (scenario_id) REFERENCES scenarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Toolbox link cards. kind 'header' makes a group header row inside the tile.
CREATE TABLE IF NOT EXISTS links (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tile_id     INT UNSIGNED NOT NULL,
  kind        VARCHAR(10)  NOT NULL DEFAULT 'link',
  name        VARCHAR(160) NOT NULL DEFAULT '',
  url         VARCHAR(2000) NOT NULL DEFAULT '',
  icon        VARCHAR(16)  NOT NULL DEFAULT '',
  colour      VARCHAR(20)  NOT NULL DEFAULT '',
  tags        VARCHAR(255) NOT NULL DEFAULT '',
  position    INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_links_tile (tile_id),
  CONSTRAINT fk_links_tile FOREIGN KEY (tile_id) REFERENCES tiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- To-do items. `bucket` is a bucket id from the tile's settings
-- (urgent, later, brainoff, none by default).
CREATE TABLE IF NOT EXISTS tasks (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tile_id     INT UNSIGNED NOT NULL,
  bucket      VARCHAR(40)  NOT NULL DEFAULT 'none',
  text        VARCHAR(1000) NOT NULL DEFAULT '',
  colour      VARCHAR(20)  NOT NULL DEFAULT '',
  tags        VARCHAR(255) NOT NULL DEFAULT '',
  position    INT          NOT NULL DEFAULT 0,
  done_at     DATETIME     NULL DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_tasks_tile (tile_id),
  CONSTRAINT fk_tasks_tile FOREIGN KEY (tile_id) REFERENCES tiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uploaded file records. The bytes live in the private storage folder under
-- `stored_name`; this table only holds the record. Also used for music tracks.
-- folder_id: 0 = top level, otherwise the id of an entries row (kind folder) of the same tile. Keep semicolons out of comments, the installer splits on them.
CREATE TABLE IF NOT EXISTS files (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tile_id       INT UNSIGNED NOT NULL,
  folder_id     INT UNSIGNED NOT NULL DEFAULT 0,
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(80)  NOT NULL,
  size          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  type          VARCHAR(120) NOT NULL DEFAULT 'application/octet-stream',
  colour        VARCHAR(20)  NOT NULL DEFAULT '',
  tags          VARCHAR(255) NOT NULL DEFAULT '',
  position      INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_files_tile (tile_id),
  CONSTRAINT fk_files_tile FOREIGN KEY (tile_id) REFERENCES tiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Thought dump entries, one row per thought.
CREATE TABLE IF NOT EXISTS thoughts (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tile_id     INT UNSIGNED NOT NULL,
  text        TEXT         NOT NULL,
  tags        VARCHAR(255) NOT NULL DEFAULT '',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_thoughts_tile (tile_id),
  CONSTRAINT fk_thoughts_tile FOREIGN KEY (tile_id) REFERENCES tiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Page-wide preferences (theme, last scenario ...).
CREATE TABLE IF NOT EXISTS settings (
  `key`   VARCHAR(64) NOT NULL,
  `value` TEXT        NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rows for the richer tiles, one table for all of them (kind says which):
--   card (flashcards: a=front, b=back, due_at + data = schedule), quote (a=quote, b=source, data=author/page/url),
--   reading (a=title, b=url, data=status/note), habit (a=habit id, day, num 1/0), time (a=label, day, num=seconds),
--   note (a=markdown text; one row per note tile).
CREATE TABLE IF NOT EXISTS entries (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tile_id     INT UNSIGNED NOT NULL,
  kind        VARCHAR(12)  NOT NULL,
  a           MEDIUMTEXT   NULL,
  b           TEXT         NULL,
  tags        VARCHAR(255) NOT NULL DEFAULT '',
  colour      VARCHAR(20)  NOT NULL DEFAULT '',
  position    INT          NOT NULL DEFAULT 0,
  day         DATE         NULL DEFAULT NULL,
  due_at      DATETIME     NULL DEFAULT NULL,
  num         BIGINT       NOT NULL DEFAULT 0,
  data        TEXT         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_entries_tile (tile_id, kind),
  KEY idx_entries_day (day),
  CONSTRAINT fk_entries_tile FOREIGN KEY (tile_id) REFERENCES tiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Read-only share links for a scenario: https://<your site>/<slug>, protected by a password, with an
-- optional expiry. The password is stored only as a hash. Deleting a scenario for good removes its links.
CREATE TABLE IF NOT EXISTS shares (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  scenario_id    INT UNSIGNED NOT NULL,
  slug           VARCHAR(40)  NOT NULL,
  pass_hash      VARCHAR(255) NOT NULL,
  expires_at     DATETIME     NULL DEFAULT NULL,
  include_files  TINYINT(1)   NOT NULL DEFAULT 1,
  views          INT UNSIGNED NOT NULL DEFAULT 0,
  last_viewed_at DATETIME     NULL DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shares_slug (slug),
  KEY idx_shares_scenario (scenario_id),
  CONSTRAINT fk_shares_scenario FOREIGN KEY (scenario_id) REFERENCES scenarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
