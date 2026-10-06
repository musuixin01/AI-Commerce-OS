CREATE TABLE agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  catalog_task_id uuid NOT NULL,
  input_version integer NOT NULL CHECK(input_version > 0),
  input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL REFERENCES users(id),
  intent text NOT NULL CHECK(intent IN('CATALOG_GENERATION')),
  plan_version text NOT NULL CHECK(length(plan_version) BETWEEN 1 AND 120),
  state text NOT NULL DEFAULT 'QUEUED' CHECK(state IN('QUEUED','RUNNING','WAITING_RETRY','WAITING_CONFIRMATION','SUCCEEDED','PARTIAL','FAILED','UNKNOWN','CANCELLED')),
  budget_currency text NOT NULL CHECK(budget_currency IN('CNY','USD','EUR')),
  budget_amount_micros bigint NOT NULL CHECK(budget_amount_micros > 0 AND budget_amount_micros <= 1000000000000),
  spent_amount_micros bigint NOT NULL DEFAULT 0 CHECK(spent_amount_micros >= 0),
  reserved_amount_micros bigint NOT NULL DEFAULT 0 CHECK(reserved_amount_micros >= 0),
  max_attempts smallint NOT NULL DEFAULT 2 CHECK(max_attempts BETWEEN 1 AND 5),
  attempt_count smallint NOT NULL DEFAULT 0 CHECK(attempt_count >= 0 AND attempt_count <= max_attempts),
  lease_owner text,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz,
  last_error_code text,
  last_error_retryable boolean,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,workspace_id,id),
  FOREIGN KEY(organization_id,workspace_id,catalog_task_id,input_version)
    REFERENCES catalog_task_versions(organization_id,workspace_id,task_id,version),
  CHECK(
    (state='RUNNING' AND lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR
    (state<>'RUNNING' AND lease_owner IS NULL AND lease_token IS NULL AND lease_until IS NULL)
  )
);

CREATE TABLE agent_task_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  task_id uuid NOT NULL,
  attempt_no smallint NOT NULL CHECK(attempt_no > 0),
  state text NOT NULL CHECK(state IN('RUNNING','SUCCEEDED','PARTIAL','FAILED','UNKNOWN')),
  worker_id text NOT NULL,
  lease_token uuid NOT NULL,
  request_key uuid NOT NULL UNIQUE,
  provider text,
  model text,
  provider_operation_ref text,
  cost_amount_micros bigint NOT NULL DEFAULT 0 CHECK(cost_amount_micros >= 0),
  error_code text,
  retryable boolean,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(organization_id,workspace_id,task_id,attempt_no),
  UNIQUE(organization_id,workspace_id,task_id,id),
  FOREIGN KEY(organization_id,workspace_id,task_id)
    REFERENCES agent_tasks(organization_id,workspace_id,id)
);

CREATE TABLE agent_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  task_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  logical_key text NOT NULL CHECK(length(logical_key) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK(kind IN('FIELD_DRAFT','IMAGE','DETAIL_IMAGE','TEXT','PROVIDER_RECEIPT')),
  version integer NOT NULL CHECK(version > 0),
  input_version integer NOT NULL CHECK(input_version > 0),
  input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
  provider text NOT NULL CHECK(length(provider) BETWEEN 1 AND 120),
  model text NOT NULL CHECK(length(model) BETWEEN 1 AND 160),
  content jsonb NOT NULL DEFAULT '{}',
  source_refs jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,workspace_id,task_id,logical_key,version),
  FOREIGN KEY(organization_id,workspace_id,task_id)
    REFERENCES agent_tasks(organization_id,workspace_id,id),
  FOREIGN KEY(organization_id,workspace_id,task_id,attempt_id)
    REFERENCES agent_task_attempts(organization_id,workspace_id,task_id,id)
);

CREATE INDEX agent_tasks_scope ON agent_tasks(organization_id,workspace_id,catalog_task_id,created_at DESC,id DESC);
CREATE INDEX agent_tasks_queue ON agent_tasks(state,next_attempt_at,created_at) WHERE state IN('QUEUED','WAITING_RETRY','RUNNING');
CREATE INDEX agent_attempts_task ON agent_task_attempts(organization_id,workspace_id,task_id,attempt_no);
CREATE INDEX agent_artifacts_task ON agent_artifacts(organization_id,workspace_id,task_id,logical_key,version);
