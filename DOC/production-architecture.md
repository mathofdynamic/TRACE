# Production Architecture

```text
Browser
  -> Nginx + TLS
     -> Next.js web process -> PostgreSQL
     -> signed GitHub webhook -> pg-boss -> Node worker
                              -> analysis/rules/reports/sync boundaries
Repository .trace <-> selective manifest API (hybrid; sourceCodeIncluded=false)
```

Staging and production require separate databases, GitHub Apps, OAuth callbacks, secrets, storage prefixes, and feature-flag namespaces. The worker and web process are independent systemd services. Cloud source analysis remains pilot-restricted until isolated job execution is supplied.
