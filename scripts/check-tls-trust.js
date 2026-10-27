// Run manually inside the actual Render container, with its existing environment.
// No credentials or application data are sent. Network failures are inconclusive.
const certificateErrors = new Set([
  'CERT_REVOKED', 'CERT_UNTRUSTED', 'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT',
]);

async function check(url, mustReject) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'manual' });
    await response.body?.cancel();
    if (mustReject) throw new Error(`UNSAFE: TLS accepted ${url} (HTTP ${response.status})`);
    console.log(`PASS: valid HTTPS control ${url}`);
  } catch (error) {
    const code = error.cause?.code || error.code;
    if (mustReject && certificateErrors.has(code)) {
      console.log(`PASS: rejected ${url}: ${code}`);
      return;
    }
    throw new Error(`FAILED or INCONCLUSIVE: ${url}: ${code || error.message}`);
  }
}

(async () => {
  console.log(`Node ${process.version}, OpenSSL ${process.versions.openssl}`);
  await check('https://nodejs.org/', false);
  await check('https://dv-g3b-emudhra.we-have-a-problem.com/', true);
  await check('https://dv-g3b-aaa-emudhra.we-have-a-problem.com/', true);
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
