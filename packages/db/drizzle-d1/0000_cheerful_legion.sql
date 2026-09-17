CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`id_token` text,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_provider_identity_unique` ON `accounts` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `analysis_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_run_id` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`severity` text NOT NULL,
	`classification` text NOT NULL,
	`evidence` text NOT NULL,
	`disposition` text,
	`disposition_reason` text,
	`disposition_actor_user_id` text,
	`disposition_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`disposition_actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_findings_run_external_unique` ON `analysis_findings` (`analysis_run_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `analysis_findings_run_idx` ON `analysis_findings` (`analysis_run_id`);--> statement-breakpoint
CREATE TABLE `analysis_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`repository_id` text,
	`pull_request_number` integer,
	`idempotency_key` text NOT NULL,
	`profile` text DEFAULT 'default' NOT NULL,
	`schema_version` text DEFAULT '0.1' NOT NULL,
	`head_sha` text,
	`base_sha` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`result` text,
	`cost` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `github_repositories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_runs_idempotency_unique` ON `analysis_runs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `analysis_runs_org_idx` ON `analysis_runs` (`organization_id`);--> statement-breakpoint
CREATE INDEX `analysis_runs_repository_idx` ON `analysis_runs` (`repository_id`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`actor_user_id` text,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_events_org_created_idx` ON `audit_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cli_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cli_connections_token_unique` ON `cli_connections` (`token_hash`);--> statement-breakpoint
CREATE INDEX `cli_connections_org_idx` ON `cli_connections` (`organization_id`);--> statement-breakpoint
CREATE INDEX `cli_connections_user_idx` ON `cli_connections` (`user_id`);--> statement-breakpoint
CREATE TABLE `cli_device_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`device_code_hash` text NOT NULL,
	`user_code_hash` text NOT NULL,
	`request_key_hash` text NOT NULL,
	`device_label` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_organization_id` text,
	`approved_user_id` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`approved_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cli_device_authorizations_device_code_unique` ON `cli_device_authorizations` (`device_code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `cli_device_authorizations_user_code_unique` ON `cli_device_authorizations` (`user_code_hash`);--> statement-breakpoint
CREATE INDEX `cli_device_authorizations_expiry_idx` ON `cli_device_authorizations` (`expires_at`);--> statement-breakpoint
CREATE INDEX `cli_device_authorizations_request_created_idx` ON `cli_device_authorizations` (`request_key_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `github_installation_repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL,
	`github_repository_id` text NOT NULL,
	`selected` integer DEFAULT false NOT NULL,
	`permissions` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `github_installations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_installation_repositories_unique` ON `github_installation_repositories` (`installation_id`,`github_repository_id`);--> statement-breakpoint
CREATE TABLE `github_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`github_installation_id` text NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`suspended_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_installations_provider_unique` ON `github_installations` (`github_installation_id`);--> statement-breakpoint
CREATE INDEX `github_installations_org_idx` ON `github_installations` (`organization_id`);--> statement-breakpoint
CREATE TABLE `github_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`github_issue_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`url` text,
	`last_synchronized_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `github_repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_issues_provider_unique` ON `github_issues` (`github_issue_id`);--> statement-breakpoint
CREATE TABLE `github_pull_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`github_pull_request_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`head_sha` text,
	`base_branch` text,
	`author_login` text,
	`url` text,
	`last_synchronized_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `github_repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_pull_requests_provider_unique` ON `github_pull_requests` (`github_pull_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `github_pull_requests_repo_number_unique` ON `github_pull_requests` (`repository_id`,`number`);--> statement-breakpoint
CREATE TABLE `github_repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`installation_id` text NOT NULL,
	`github_repository_id` text NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`full_name` text NOT NULL,
	`default_branch` text,
	`visibility` text,
	`state` text DEFAULT 'active' NOT NULL,
	`remote_head_sha` text,
	`last_synchronized_at` integer,
	`disconnected_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`installation_id`) REFERENCES `github_installations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_repositories_provider_unique` ON `github_repositories` (`github_repository_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `github_repositories_org_full_name_unique` ON `github_repositories` (`organization_id`,`full_name`);--> statement-breakpoint
CREATE INDEX `github_repositories_installation_idx` ON `github_repositories` (`installation_id`);--> statement-breakpoint
CREATE TABLE `github_webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_id` text NOT NULL,
	`event_name` text NOT NULL,
	`action` text,
	`installation_id` text,
	`payload_sha256` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`job_id` text,
	`received_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`processed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_webhook_deliveries_delivery_unique` ON `github_webhook_deliveries` (`delivery_id`);--> statement-breakpoint
CREATE INDEX `github_webhook_deliveries_status_idx` ON `github_webhook_deliveries` (`status`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_org_user_unique` ON `memberships` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `onboarding_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`intended_usage` text,
	`execution_mode` text,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_profiles_user_unique` ON `onboarding_profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `sync_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`sync_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'negotiating' NOT NULL,
	`branch` text,
	`head_commit` text,
	`trace_version` text NOT NULL,
	`schema_version` text NOT NULL,
	`manifest` text NOT NULL,
	`total_bytes` integer DEFAULT 0 NOT NULL,
	`artifact_count` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `github_repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `cli_connections`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_operations_idempotency_unique` ON `sync_operations` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_operations_repo_sync_unique` ON `sync_operations` (`repository_id`,`sync_id`);--> statement-breakpoint
CREATE INDEX `sync_operations_repo_created_idx` ON `sync_operations` (`repository_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sync_operations_connection_idx` ON `sync_operations` (`connection_id`);--> statement-breakpoint
CREATE TABLE `sync_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`artifact_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`path` text NOT NULL,
	`checksum` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sensitivity` text NOT NULL,
	`schema_version` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text NOT NULL,
	`projection` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`operation_id`) REFERENCES `sync_operations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_uploads_operation_artifact_unique` ON `sync_uploads` (`operation_id`,`artifact_id`);--> statement-breakpoint
CREATE INDEX `sync_uploads_operation_idx` ON `sync_uploads` (`operation_id`);--> statement-breakpoint
CREATE TABLE `synced_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`artifact_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`path` text NOT NULL,
	`checksum` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sensitivity` text NOT NULL,
	`schema_version` text NOT NULL,
	`execution_origin` text DEFAULT 'local' NOT NULL,
	`content` text NOT NULL,
	`metadata` text NOT NULL,
	`projection` text NOT NULL,
	`generated_at` integer NOT NULL,
	`synced_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`superseded_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `github_repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`operation_id`) REFERENCES `sync_operations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `synced_artifacts_operation_artifact_unique` ON `synced_artifacts` (`operation_id`,`artifact_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `synced_artifacts_operation_path_unique` ON `synced_artifacts` (`operation_id`,`path`);--> statement-breakpoint
CREATE INDEX `synced_artifacts_repo_type_idx` ON `synced_artifacts` (`repository_id`,`artifact_type`);--> statement-breakpoint
CREATE TABLE `system_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `system_jobs_status_idx` ON `system_jobs` (`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`image` text,
	`email_verified` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verifications_identifier_idx` ON `verifications` (`identifier`);