CREATE TABLE "analysis_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"severity" text NOT NULL,
	"classification" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"disposition" text,
	"disposition_reason" text,
	"disposition_actor_user_id" uuid,
	"disposition_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"repository_id" uuid,
	"pull_request_number" integer,
	"idempotency_key" text NOT NULL,
	"profile" text DEFAULT 'default' NOT NULL,
	"schema_version" text DEFAULT '0.1' NOT NULL,
	"head_sha" text,
	"base_sha" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"cost" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_findings" ADD CONSTRAINT "analysis_findings_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_findings" ADD CONSTRAINT "analysis_findings_disposition_actor_user_id_users_id_fk" FOREIGN KEY ("disposition_actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_findings_run_external_unique" ON "analysis_findings" USING btree ("analysis_run_id","external_id");--> statement-breakpoint
CREATE INDEX "analysis_findings_run_idx" ON "analysis_findings" USING btree ("analysis_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_runs_idempotency_unique" ON "analysis_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "analysis_runs_org_idx" ON "analysis_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "analysis_runs_repository_idx" ON "analysis_runs" USING btree ("repository_id");