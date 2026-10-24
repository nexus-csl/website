# Nexus dedicated staff chat

The intended staff entry is `https://csl-mfg.com/nexus`, leading to
`https://chat.csl-mfg.com/`. LibreChat runs as a separate Docker Compose project;
the manufacturing website remains its existing Node service.

## Website switch

Set `NEXUS_CHAT_URL=https://chat.csl-mfg.com` in the website's private environment
only after the chat has valid HTTPS and a working login page. Restart the CSL
website service. GET and HEAD requests to `/nexus` then receive a non-cached 302
redirect. Query parameters are deliberately not forwarded. The old
`/api/nexus/*` shared-code preview endpoints return 410 while the switch is set.
Removing the setting restores the previous preview, not connected company data.

## Host configuration

- Dedicated project directory: `/opt/csl-nexus`.
- Application listens on `127.0.0.1:3080`; databases and search services publish
  no host ports.
- The existing Apache server terminates TLS and proxies the dedicated hostname.
  No additional host NGINX is installed.
- Persistent Docker volumes retain MongoDB, vector data, search data and app data.
- The private `production.env` contains independently generated encryption and
  session secrets. Never commit it, database volumes, uploads or chat logs.
- HTTP ACME challenges use the dedicated webroot. Other HTTP traffic redirects
  to HTTPS. A deploy hook reloads Apache after certificate renewal.
- The chat hostname is marked `noindex, nofollow`.

The deployment uses the official LibreChat container images. Record upstream
commit and actual image IDs on the host before any later update; do not assume
pulling a moving image tag is a tested upgrade.

## First account and provider activation

Public registration is disabled. An authorized operator must provision the
first administrator through LibreChat's supported account workflow. Passwords
must be entered privately, not committed, put in shell arguments or sent in chat.
Do not leave unrestricted signup open for someone else to claim the first admin.

Provider credentials are a separate activation step. Staff should not bring their
own OpenAI keys or Workspace Agent tokens. A server-held provider credential and
an approved model must be configured before testing AI answers. Installing
LibreChat does not connect it automatically to the ChatGPT Nexus Workspace Agent.
The same-agent answer-return path still needs to be demonstrated.

## Staff and knowledge permissions remain a separate integration

The approved staff directory and department access rules are maintained in CSL's
private Drive. Synchronize verified identities, active status, department, role
and access profile into the authorization service. An access code is an employee
identifier, not proof of identity. Do not commit staff records to this public
website repository.

Management workspace permissions and private staff permissions remain distinct.
Production must not retrieve Finance sources. Source tools enforce those rules
before returning documents, order rows, emails or attachments. Do not ingest all
company material into a shared index and rely on a prompt to hide restricted data.
No Trello writes, outgoing emails or financial actions are enabled by installing
the chat application.

## Operations

Use the project's private environment for Compose variable interpolation:

```sh
cd /opt/csl-nexus
docker compose --env-file production.env -f compose.yaml ps
docker compose --env-file production.env -f compose.yaml logs --tail 50 api
```

Treat logs as potentially private; never paste them publicly without review.
Do not run `docker compose down -v`: that deletes persistent volumes.

The German Cockpit idle timeout is configured as 60 minutes. Its Apache proxy
timeout is configured as 3,600 seconds, replacing a previous 120-second proxy
timeout. These settings do not disable authentication or guarantee that a
network failure cannot disconnect a session.

## Validation

Website validation includes the existing suite plus dedicated redirect,
non-forwarding of access-code query values, retired preview endpoints and unsafe
redirect-configuration rejection. Host activation must also verify the valid TLS
chain, HTTP redirect, chat login page, registration-disabled state and healthy
containers. Provider answers and department enforcement require their own tests.
