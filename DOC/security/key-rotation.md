# Key Rotation Runbook

Rotate GitHub App private keys, OAuth secrets, model API keys, database credentials, and CLI sync tokens independently. Add the new secret to the approved secret store, deploy to staging, verify health and signed webhook fixtures, switch production, revoke the old secret, and record the rotation timestamp. Never place a key in `.trace`, logs, screenshots, or issue text.
