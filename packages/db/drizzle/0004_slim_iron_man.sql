CREATE TABLE "cli_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cli_device_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code_hash" text NOT NULL,
	"device_label" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_organization_id" uuid,
	"approved_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"sync_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'negotiating' NOT NULL,
	"branch" text,
	"head_commit" text,
	"trace_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"total_bytes" integer DEFAULT 0 NOT NULL,
	"artifact_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"artifact_id" text NOT NULL,
	"artifact_type" text NOT NULL,
	"path" text NOT NULL,
	"checksum" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sensitivity" text NOT NULL,
	"schema_version" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"projection" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synced_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"artifact_id" text NOT NULL,
	"artifact_type" text NOT NULL,
	"path" text NOT NULL,
	"checksum" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sensitivity" text NOT NULL,
	"schema_version" text NOT NULL,
	"execution_origin" text DEFAULT 'local' NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"projection" jsonb NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_repositories" ADD COLUMN "remote_head_sha" text;--> statement-breakpoint
ALTER TABLE "cli_connections" ADD CONSTRAINT "cli_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cli_connections" ADD CONSTRAINT "cli_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cli_device_authorizations" ADD CONSTRAINT "cli_device_authorizations_approved_organization_id_organizations_id_fk" FOREIGN KEY ("approved_organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cli_device_authorizations" ADD CONSTRAINT "cli_device_authorizations_approved_user_id_users_id_fk" FOREIGN KEY ("approved_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_connection_id_cli_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."cli_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_uploads" ADD CONSTRAINT "sync_uploads_operation_id_sync_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."sync_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synced_artifacts" ADD CONSTRAINT "synced_artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synced_artifacts" ADD CONSTRAINT "synced_artifacts_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synced_artifacts" ADD CONSTRAINT "synced_artifacts_operation_id_sync_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."sync_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cli_connections_token_unique" ON "cli_connections" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "cli_connections_org_idx" ON "cli_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cli_connections_user_idx" ON "cli_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cli_device_authorizations_device_code_unique" ON "cli_device_authorizations" USING btree ("device_code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "cli_device_authorizations_user_code_unique" ON "cli_device_authorizations" USING btree ("user_code_hash");--> statement-breakpoint
CREATE INDEX "cli_device_authorizations_expiry_idx" ON "cli_device_authorizations" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_operations_idempotency_unique" ON "sync_operations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_operations_repo_sync_unique" ON "sync_operations" USING btree ("repository_id","sync_id");--> statement-breakpoint
CREATE INDEX "sync_operations_repo_created_idx" ON "sync_operations" USING btree ("repository_id","created_at");--> statement-breakpoint
CREATE INDEX "sync_operations_connection_idx" ON "sync_operations" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_uploads_operation_artifact_unique" ON "sync_uploads" USING btree ("operation_id","artifact_id");--> statement-breakpoint
CREATE INDEX "sync_uploads_operation_idx" ON "sync_uploads" USING btree ("operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "synced_artifacts_repo_artifact_unique" ON "synced_artifacts" USING btree ("repository_id","artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "synced_artifacts_repo_path_unique" ON "synced_artifacts" USING btree ("repository_id","path");--> statement-breakpoint
CREATE INDEX "synced_artifacts_repo_type_idx" ON "synced_artifacts" USING btree ("repository_id","artifact_type");