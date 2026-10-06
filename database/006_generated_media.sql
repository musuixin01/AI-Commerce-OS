ALTER TABLE agent_tasks DROP CONSTRAINT agent_tasks_intent_check;
ALTER TABLE agent_tasks ADD CONSTRAINT agent_tasks_intent_check
  CHECK(intent IN('CATALOG_GENERATION','CATALOG_IMAGE_GENERATION'));

CREATE TABLE generated_media_versions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  catalog_task_id uuid NOT NULL,
  agent_task_id uuid NOT NULL,
  attempt_no smallint NOT NULL CHECK(attempt_no > 0),
  role text NOT NULL CHECK(role IN('MAIN_IMAGE','DETAIL_IMAGE')),
  version integer NOT NULL CHECK(version > 0),
  input_version integer NOT NULL CHECK(input_version > 0),
  input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
  provider text NOT NULL CHECK(length(provider) BETWEEN 1 AND 120),
  model text NOT NULL CHECK(length(model) BETWEEN 1 AND 160),
  source_asset_ids uuid[] NOT NULL CHECK(cardinality(source_asset_ids) BETWEEN 1 AND 8),
  mime text NOT NULL CHECK(mime IN('image/png','image/jpeg','image/webp')),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  byte_size integer NOT NULL CHECK(byte_size > 0 AND byte_size <= 20971520),
  preview_size integer NOT NULL CHECK(preview_size > 0),
  width integer NOT NULL CHECK(width > 0 AND width <= 8192),
  height integer NOT NULL CHECK(height > 0 AND height <= 8192),
  object_key text NOT NULL UNIQUE,
  preview_key text NOT NULL UNIQUE,
  review_state text NOT NULL DEFAULT 'NEEDS_CONFIRMATION'
    CHECK(review_state IN('NEEDS_CONFIRMATION','CONFIRMED')),
  confirmed_by uuid REFERENCES users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,workspace_id,catalog_task_id,role,version),
  UNIQUE(organization_id,workspace_id,id),
  FOREIGN KEY(organization_id,workspace_id,catalog_task_id)
    REFERENCES catalog_tasks(organization_id,workspace_id,id),
  FOREIGN KEY(organization_id,workspace_id,agent_task_id)
    REFERENCES agent_tasks(organization_id,workspace_id,id),
  CHECK(
    (review_state='NEEDS_CONFIRMATION' AND confirmed_by IS NULL AND confirmed_at IS NULL)
    OR
    (review_state='CONFIRMED' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
  )
);

CREATE INDEX generated_media_catalog
  ON generated_media_versions(organization_id,workspace_id,catalog_task_id,role,version DESC);
CREATE INDEX generated_media_agent
  ON generated_media_versions(organization_id,workspace_id,agent_task_id,attempt_no);

