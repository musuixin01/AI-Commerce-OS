CREATE TABLE catalog_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL, workspace_id uuid NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
 state text NOT NULL DEFAULT 'NEEDS_INPUT' CHECK(state='NEEDS_INPUT'),
 fields jsonb NOT NULL DEFAULT '{}', asset_ids uuid[] NOT NULL DEFAULT '{}',
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,workspace_id,id),
 FOREIGN KEY(organization_id,workspace_id) REFERENCES workspaces(organization_id,id),
 CHECK(cardinality(asset_ids)<=8)
);
CREATE TABLE media_assets (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, workspace_id uuid NOT NULL, task_id uuid NOT NULL,
 name text NOT NULL, mime text NOT NULL CHECK(mime IN('image/jpeg','image/png','image/webp')),
 origin text NOT NULL DEFAULT 'original' CHECK(origin='original'), version integer NOT NULL DEFAULT 1 CHECK(version=1),
 sha256 text NOT NULL, byte_size integer NOT NULL CHECK(byte_size>0 AND byte_size<=10485760),
 preview_size integer NOT NULL CHECK(preview_size>0),
 width integer NOT NULL CHECK(width>0), height integer NOT NULL CHECK(height>0),
 object_key text NOT NULL UNIQUE, preview_key text NOT NULL UNIQUE,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,workspace_id,id),
 FOREIGN KEY(organization_id,workspace_id,task_id) REFERENCES catalog_tasks(organization_id,workspace_id,id)
);
CREATE TABLE catalog_task_versions (
 organization_id uuid NOT NULL, workspace_id uuid NOT NULL, task_id uuid NOT NULL,
 version integer NOT NULL, fields jsonb NOT NULL, asset_ids uuid[] NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,workspace_id,task_id,version),
 FOREIGN KEY(organization_id,workspace_id,task_id) REFERENCES catalog_tasks(organization_id,workspace_id,id)
);
CREATE INDEX catalog_tasks_scope ON catalog_tasks(organization_id,workspace_id,updated_at DESC,id DESC);
CREATE INDEX media_assets_scope ON media_assets(organization_id,workspace_id,task_id);
