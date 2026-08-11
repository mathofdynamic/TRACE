# Web Outage Runbook

Check Nginx, `trace-web`, PostgreSQL connectivity, `/api/health`, recent releases, and resource pressure. Contain by disabling publication and semantic flags, then restart only the named web service after preserving logs. If the database is healthy, rollback the web release; if not, use the database runbook and restore verification procedure.
