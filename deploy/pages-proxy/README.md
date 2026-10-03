# TRACE canonical owner-production proxy

`trace-code.pages.dev` is assigned to the owner-production browser origin. The
fixed Pages Function forwards paths, queries, methods, bodies and headers only to
`https://trace-production.mathofdynamic2.workers.dev`. It sets forwarding host and
protocol metadata; these headers grant no authentication. D1 and Queue remain in
the production Worker. GitHub webhooks and CLI APIs use the direct Worker backend.

Deploy only through the protected `deploy-production-pages-proxy.yml` main workflow,
with exact reviewed SHA and `DEPLOY_TRACE_CANONICAL_PAGES` confirmation. Inspection
captures the existing Pages deployment before mutation. The public directory is
only a routing asset; every request is handled by the Function.

Staging acceptance uses `https://trace-test-staging.mathofdynamic2.workers.dev`,
never this Pages hostname. See `DOC/production-canary.md` for live cutover evidence.
