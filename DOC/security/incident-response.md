# Incident Response Runbook

1. Disable affected feature flags and isolate the tenant or repository.
2. Revoke and rotate GitHub App keys, OAuth secrets, model keys, and sync tokens as applicable.
3. Preserve sanitized audit and webhook metadata; do not copy raw source or credentials into tickets.
4. Identify affected organizations, artifacts, jobs, and backups.
5. Patch, test webhook/auth/artifact boundaries, and deploy through staging.
6. Verify recovery, notify the designated owner, and record residual risk and follow-up.

The production reporting contact is still an owner action and must be configured before public launch.
