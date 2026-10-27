# October 2026 runtime security update

## Assessment

Render's email and [eMudhra advisory](https://render.com/docs/advisory-emudhra), and the [Node.js security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases), recommend Node 22.23.4, 24.22.1 or 26.12.1 or later in the respective major line.

The previous floating `node:22-alpine` tag does not identify the version in an existing deployment. Production compromise or a vulnerable deployed version has NOT been established. The application makes outbound HTTPS requests to GDELT, NewsAPI and OpenAI using Node's built-in fetch. It uses only built-in Node modules: there are no npm dependencies or lockfile to upgrade, and no custom CA files or TLS verification overrides were found in tracked application code. Render environment overrides remain unverified.

The Dockerfile now specifies `node:22.23.4-alpine`, preserving Node major 22 and Alpine. It installs/upgrades Alpine's `ca-certificates` package and regenerates the system bundle. Node's bundled trust is updated by the Node release itself; updating OS certificates alone is insufficient. Keep the default bundled trust unless a separately reviewed configuration is necessary. Do not disable TLS verification. The engines field now excludes old unpatched releases; it is advisory in npm and does not select Render's Docker runtime.

The image tag pins the Node patch but not an immutable image digest or all OS packages. Future patched releases require deliberate updates. Rebuild with fresh base/package layers; a cached build or restart of the old container does not apply the fix. Installing the newest distribution CA package is not proof of certificate rejection: verify using the application HTTP client after deployment.

## Before any production deployment or merge

1. Inspect the actual Render service: source repository, branch, deployed commit/image, Docker runtime, latest successful build, automatic deploy and preview settings, and attached disk. `render.yaml` is desired configuration, not proof of live configuration. This PR does not change that file or README, which are edited by disk PR #1.
2. Back up the entire live `/app/data` off the instance, record counts and verify the backup can be restored. Data is local JSON; a new deployment can discard it without a persistent disk. PR #1 is still open. If attaching its disk, follow its migration instructions: a new mount hides existing files and does not copy data. Do not deploy or merge either PR until data preservation is established.
3. Record the commands below in the live service shell. Inspect only relevant trust settings (`NODE_OPTIONS`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `NODE_TLS_REJECT_UNAUTHORIZED`); do not export all environment variables or disclose keys. Inspect any referenced custom bundle separately.

```sh
node --version
node -p 'JSON.stringify({openssl:process.versions.openssl,undici:process.versions.undici})'
apk info -v ca-certificates ca-certificates-bundle
sha256sum /etc/ssl/certs/ca-certificates.crt
```

Package version/hash records identify the store but do not establish whether compromised chains are rejected. Before this PR is available in production, copy `scripts/check-tls-trust.js` into a temporary location and run it with Node in the live container if a baseline is required. Do not add a public diagnostic endpoint.

4. Obtain explicit approval for merge/rebuild/deploy after reviewing backup, restoration plan, downtime and external API test costs. Merging main may automatically deploy. A disk-backed service can incur deployment downtime. Keep a rollback image/commit and data backup; rolling back to vulnerable Node reintroduces the issue and should not be the normal recovery path.

## Build and compatibility checks

```sh
docker build --pull --no-cache -t resona-node-security .
docker run --rm --entrypoint node resona-node-security --version
docker run --rm --entrypoint sh resona-node-security -c 'apk info -v ca-certificates ca-certificates-bundle; test -s /etc/ssl/certs/ca-certificates.crt'
docker run --rm --entrypoint node resona-node-security --check /app/server/api-server.js
docker run --rm --entrypoint node resona-node-security /app/scripts/check-tls-trust.js
```

Run a staging container on port 4173 with a separate test data volume, a test ADMIN_TOKEN, and no real API keys. Check `/`, `/api/health`, public stored Signals/published stories, missing-token rejection, and draft/publish/restart persistence using supplied synthetic Signals and local fallback generation. Confirm PORT can be overridden and that `/app/data` is writable. Real OpenAI, GDELT and NewsAPI connectivity needs a separate approved staging check; fallback success is not proof of provider connectivity.

## After approved fresh deployment

Run the version and OS-store commands above, then from `/app`:

```sh
node scripts/check-tls-trust.js
```

The script uses the same built-in fetch client as the application, with a valid HTTPS control and both endpoints referenced by Render. Any HTTP response from a compromised endpoint is failure, regardless of status. DNS errors, timeouts and unrelated failures are inconclusive, never a pass. Inspect unfamiliar certificate errors rather than treating all connection failures as safe. Do not send secrets to these endpoints. Verify health, archive record counts, authorized Studio operation, provider connectivity and data persistence, then record deployed commit, versions and results. Update any custom CA bundle identified in live configuration and repeat the checks.

## Verification limits

Production Node version, CA package, trust overrides, image digest, disk and automatic deployment settings require Render access. They were not available during repository review. Docker build and container tests require a Docker engine; local host tests do not validate Alpine/musl or the built image. See PR validation notes for checks actually performed; commands in this document are a runbook, not claims of execution.
