# GitHub App Permission Matrix

| Permission/event | Level | Reason | Write behavior |
|---|---|---|---|
| Metadata | read | Installation and repository identity | None |
| Contents | read | Future deterministic repository retrieval | No commits or file writes |
| Pull requests | read | PR metadata, files, checks context | No approval, merge, or comment by default |
| Issues | read | Linked goal/issue context | No issue writes |
| Installation/repository/pull_request/push/issues events | receive | Keep state synchronized | Delivery only; async processing |

Checks, comments, and content writes are not enabled by the current integration.
