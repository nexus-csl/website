# Nexus dedicated chat

Nexus is installed using LibreChat and serves its login at https://chat.csl-mfg.com/login.
The main website entry https://csl-mfg.com/nexus redirects to https://chat.csl-mfg.com/.
HTTPS is enabled with automatic certificate renewal configured.

## Website behavior

Set the server-only NEXUS_CHAT_URL deployment setting to the approved HTTPS chat URL to enable the redirect. GET and HEAD requests to /nexus then receive a non-cached 302 response. Query parameters are not forwarded. The old /api/nexus/* shared-code preview endpoints return 410 while the redirect is enabled.

The website change passed all 28 tests locally. The server-side test suite also passed before activation, and the website health endpoint returned an OK result after rollout.

## Activation still required

The hosted login is ready; it does not yet represent an activated CSL Workspace Agent connection. Administrator provisioning, the server-held AI provider credential, staff-directory synchronization, departmental permissions and permission-filtered company knowledge still require configuration and acceptance tests. Public self-registration is disabled.

The optional document retrieval capability remains disabled until its provider credential and authorization are configured. Staff do not receive company provider keys or Workspace Agent tokens.

Keep management workspace access and private staff access distinct. Production staff must not retrieve Finance sources. These restrictions must be enforced by the integration, not solely by AI instructions.

Passwords, credentials, staff records, company knowledge, chat content and internal server operations details do not belong in this public website repository.
