# TRACE GitHub App setup

This document configures the repository connection used by the Cloudflare test deployment. It is separate from the GitHub OAuth App used for TRACE sign-in.

## App registration

Create a GitHub App under the account or organization that owns the test App. Configure:

- Homepage URL: `https://trace-code.pages.dev/`
- Setup URL: leave empty for this flow. GitHub uses the callback URL when user authorization during installation is enabled.
- Callback URL: `https://trace-code.pages.dev/api/github/setup`
- Request user authorization during installation: enabled
- Webhooks: active
- Webhook URL: `https://trace-code.pages.dev/api/github/webhooks`

Use the minimum read-only permissions required by the current phase:

- Repository metadata: read-only
- Repository contents: read-only
- Pull requests: read-only
- Issues: read-only

Subscribe to installation, installation repositories, repository, pull request, push, and issues events. Do not enable write access to contents, issues, pull requests, administration, workflow, members, deployments, or comments for this test.

GitHub redirects to the callback URL with an `installation_id`, `setup_action`, `code`, and `state`. TRACE exchanges the code server-side, verifies that the signed-in GitHub user can access that installation, then uses a short-lived installation token to read repository metadata. TRACE does not trust an `installation_id` by itself.

## Secrets

Store these values only as Cloudflare Worker secrets for the staging environment:

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

After secrets are configured, open `https://trace-code.pages.dev/app/repositories`, choose **Install GitHub App**, install it on a test personal account or organization, grant access to one repository, and return to TRACE. The page must show the installation account and repository list. Select one repository and save the selection.

The current phase only connects and indexes repository metadata. It does not analyze code, publish comments, or write to GitHub.

Official references:

- [Registering a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app)
- [About the setup URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url)
- [Installing a GitHub App](https://docs.github.com/en/apps/using-github-apps/installing-github-apps-from-a-third-party)
- [Generating an installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
