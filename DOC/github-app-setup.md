# TRACE GitHub App setup

The existing production App is **TRACE Production Integration**, App ID
`5082884`, installation `166179374` for `mathofdynamic`. Do not uninstall or
reinstall it. The approved external installation uses `repository_selection=all`;
TRACE processes only owner-selected repositories. TRACE and the fixture are active;
other discovered repositories remain available metadata. Public customer cutover is NO.

It is separate from OAuth App **TRACE Production**, whose callback is
`https://trace-code.pages.dev/api/auth/github/callback`. Staging uses its separate
registrations and `https://trace-test-staging.mathofdynamic2.workers.dev`, never Pages.

## App registration

For the existing production App, retain these registrations:

- Homepage URL: `https://trace-code.pages.dev/`
- Setup URL: leave empty for this flow. GitHub uses the callback URL when user authorization during installation is enabled.
- Callback URL: `https://trace-code.pages.dev/api/github/setup`
- Request user authorization during installation: enabled
- Webhooks: active
- Webhook URL: `https://trace-production.mathofdynamic2.workers.dev/api/github/webhooks`

Use the minimum read-only permissions required by the current phase:

- Repository metadata: read-only
- Repository contents: read-only
- Pull requests: read-only
- Issues: read-only

Subscribe to installation, installation repositories, repository, pull request, push, and issues events. Do not enable write access to contents, issues, pull requests, administration, workflow, members, deployments, or comments for this owner production release.

GitHub redirects to the callback URL with an `installation_id`, `setup_action`, `code`, and `state`. TRACE exchanges the code server-side, verifies that the signed-in GitHub user can access that installation, then uses a short-lived installation token to read repository metadata. TRACE does not trust an `installation_id` by itself.

## Secrets

Use the existing protected `production-canary` environment and production Worker
bindings. Keep the nonsecret `TRACE_GITHUB_APP_CALLBACK_URL` equal to
`https://trace-code.pages.dev/api/github/setup`. Secret values remain in protected
Actions/Worker secret storage; never copy them into Codex Cloud. Runtime binding names:

```text
GITHUB_APP_ID
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET
GITHUB_APP_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET
GITHUB_APP_SLUG
GITHUB_APP_CALLBACK_URL
GITHUB_APP_INSTALL_URL
```

`GITHUB_APP_SETUP_URL` is optional and is not used when user authorization during installation is enabled.

The private key must include its complete PEM header and footer. Keep the OAuth App values separate:

```text
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
```

Never commit any of these values, put them in `.trace`, or send them to the browser.

## Owner verification

Open `https://trace-code.pages.dev/app/repositories` using a fresh normal owner
login. Existing completed onboarding and the recognized installation must remain
intact. Select repositories explicitly; do not activate the whole installation
catalog automatically. Production acceptance and rollback identities are recorded
in [the canonical origin runbook](production-canary.md#canonical-owner-production-origin-acceptance--2026-10-03).

Official references:

- [Registering a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app)
- [About the setup URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url)
- [Installing a GitHub App](https://docs.github.com/en/apps/using-github-apps/installing-github-apps-from-a-third-party)
- [Generating an installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
