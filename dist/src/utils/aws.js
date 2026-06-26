import { logForDebugging } from "./debug.js";
function isAwsCredentialsProviderError(err) {
  return err?.name === "CredentialsProviderError";
}
function isValidAwsStsOutput(obj) {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  const output = obj;
  if (!output.Credentials || typeof output.Credentials !== "object") {
    return false;
  }
  const credentials = output.Credentials;
  return typeof credentials.AccessKeyId === "string" && typeof credentials.SecretAccessKey === "string" && typeof credentials.SessionToken === "string" && credentials.AccessKeyId.length > 0 && credentials.SecretAccessKey.length > 0 && credentials.SessionToken.length > 0;
}
async function checkStsCallerIdentity() {
  const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
  await new STSClient().send(new GetCallerIdentityCommand({}));
}
async function clearAwsIniCache() {
  try {
    logForDebugging("Clearing AWS credential provider cache");
    const { fromIni } = await import("@aws-sdk/credential-providers");
    const iniProvider = fromIni({ ignoreCache: true });
    await iniProvider();
    logForDebugging("AWS credential provider cache refreshed");
  } catch (_error) {
    logForDebugging(
      "Failed to clear AWS credential cache (this is expected if no credentials are configured)"
    );
  }
}
export {
  checkStsCallerIdentity,
  clearAwsIniCache,
  isAwsCredentialsProviderError,
  isValidAwsStsOutput
};
