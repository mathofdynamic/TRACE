# Rollback Runbook

1. Disable risky feature flags and stop new publication/sync jobs.
2. Record current web, worker, migration, and queue versions.
3. Switch systemd units to the previous immutable release directory.
4. Apply only a tested forward-fix for irreversible migrations; never reset production data.
5. Verify health, authentication, webhook acknowledgement, queue processing, and artifact validation.
6. Reconcile any queued jobs and communicate the rollback status to the pilot owner.
