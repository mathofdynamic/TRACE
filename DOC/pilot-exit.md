# Pilot Exit and Rollback

- Disable semantic, comments, sync, and scheduled flags first.
- Stop the organization’s worker jobs and preserve audit metadata.
- Export validated repository-native `.trace` artifacts and a sanitized findings/disposition report.
- Revoke GitHub installation, OAuth sessions, model keys, and sync tokens as applicable.
- Verify repository artifacts remain usable without TRACE services.
- Run database deletion/retention procedures according to the configured policy and document backup limitations.
- Capture unresolved issues and decide whether the pilot is paused, extended, or closed.
