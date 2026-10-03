ALTER TABLE `github_webhook_deliveries` ADD `organization_id` text REFERENCES organizations(id);--> statement-breakpoint
ALTER TABLE `github_webhook_deliveries` ADD `repository_id` text REFERENCES github_repositories(id);--> statement-breakpoint
ALTER TABLE `github_webhook_deliveries` ADD `normalized_event` text;--> statement-breakpoint
ALTER TABLE `github_webhook_deliveries` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `github_webhook_deliveries` ADD `last_error` text;--> statement-breakpoint
ALTER TABLE `github_webhook_deliveries` ADD `last_attempt_at` integer;--> statement-breakpoint
ALTER TABLE `github_webhook_deliveries` ADD `replay_requested_at` integer;--> statement-breakpoint
ALTER TABLE `github_webhook_deliveries` ADD `replay_requested_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `github_webhook_deliveries` ADD `replay_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `github_webhook_deliveries_org_status_idx` ON `github_webhook_deliveries` (`organization_id`,`status`);