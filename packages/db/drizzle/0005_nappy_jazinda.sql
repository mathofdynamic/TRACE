DROP INDEX "synced_artifacts_repo_artifact_unique";--> statement-breakpoint
DROP INDEX "synced_artifacts_repo_path_unique";--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "synced_artifacts_operation_artifact_unique" ON "synced_artifacts" USING btree ("operation_id","artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "synced_artifacts_operation_path_unique" ON "synced_artifacts" USING btree ("operation_id","path");