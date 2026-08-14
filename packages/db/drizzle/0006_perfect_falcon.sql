ALTER TABLE "cli_device_authorizations" ADD COLUMN "request_key_hash" text;--> statement-breakpoint
UPDATE "cli_device_authorizations" SET "request_key_hash" = "device_code_hash" WHERE "request_key_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "cli_device_authorizations" ALTER COLUMN "request_key_hash" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "cli_device_authorizations_request_created_idx" ON "cli_device_authorizations" USING btree ("request_key_hash","created_at");
