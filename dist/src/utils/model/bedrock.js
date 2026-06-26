import memoize from "lodash-es/memoize.js";
import { refreshAndGetAwsCredentials } from "../auth.js";
import { getAWSRegion, isEnvTruthy } from "../envUtils.js";
import { logError } from "../log.js";
import { getAWSClientProxyConfig } from "../proxy.js";
const getBedrockInferenceProfiles = memoize(async function() {
  const [client, { ListInferenceProfilesCommand }] = await Promise.all([
    createBedrockClient(),
    import("@aws-sdk/client-bedrock")
  ]);
  const allProfiles = [];
  let nextToken;
  try {
    do {
      const command = new ListInferenceProfilesCommand({
        ...nextToken && { nextToken },
        typeEquals: "SYSTEM_DEFINED"
      });
      const response = await client.send(command);
      if (response.inferenceProfileSummaries) {
        allProfiles.push(...response.inferenceProfileSummaries);
      }
      nextToken = response.nextToken;
    } while (nextToken);
    return allProfiles.filter((profile) => profile.inferenceProfileId?.includes("anthropic")).map((profile) => profile.inferenceProfileId).filter(Boolean);
  } catch (error) {
    logError(error);
    throw error;
  }
});
function findFirstMatch(profiles, substring) {
  return profiles.find((p) => p.includes(substring)) ?? null;
}
async function createBedrockClient() {
  const { BedrockClient } = await import("@aws-sdk/client-bedrock");
  const region = getAWSRegion();
  const skipAuth = isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH);
  const clientConfig = {
    region,
    ...process.env.ANTHROPIC_BEDROCK_BASE_URL && {
      endpoint: process.env.ANTHROPIC_BEDROCK_BASE_URL
    },
    ...await getAWSClientProxyConfig(),
    ...skipAuth && {
      requestHandler: new (await import("@smithy/node-http-handler")).NodeHttpHandler(),
      httpAuthSchemes: [
        {
          schemeId: "smithy.api#noAuth",
          identityProvider: () => async () => ({}),
          signer: new (await import("@smithy/core")).NoAuthSigner()
        }
      ],
      httpAuthSchemeProvider: () => [{ schemeId: "smithy.api#noAuth" }]
    }
  };
  if (!skipAuth && !process.env.AWS_BEARER_TOKEN_BEDROCK) {
    const cachedCredentials = await refreshAndGetAwsCredentials();
    if (cachedCredentials) {
      clientConfig.credentials = {
        accessKeyId: cachedCredentials.accessKeyId,
        secretAccessKey: cachedCredentials.secretAccessKey,
        sessionToken: cachedCredentials.sessionToken
      };
    }
  }
  return new BedrockClient(clientConfig);
}
async function createBedrockRuntimeClient() {
  const { BedrockRuntimeClient } = await import("@aws-sdk/client-bedrock-runtime");
  const region = getAWSRegion();
  const skipAuth = isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH);
  const clientConfig = {
    region,
    ...process.env.ANTHROPIC_BEDROCK_BASE_URL && {
      endpoint: process.env.ANTHROPIC_BEDROCK_BASE_URL
    },
    ...await getAWSClientProxyConfig(),
    ...skipAuth && {
      // BedrockRuntimeClient defaults to HTTP/2 without fallback
      // proxy servers may not support this, so we explicitly force HTTP/1.1
      requestHandler: new (await import("@smithy/node-http-handler")).NodeHttpHandler(),
      httpAuthSchemes: [
        {
          schemeId: "smithy.api#noAuth",
          identityProvider: () => async () => ({}),
          signer: new (await import("@smithy/core")).NoAuthSigner()
        }
      ],
      httpAuthSchemeProvider: () => [{ schemeId: "smithy.api#noAuth" }]
    }
  };
  if (!skipAuth && !process.env.AWS_BEARER_TOKEN_BEDROCK) {
    const cachedCredentials = await refreshAndGetAwsCredentials();
    if (cachedCredentials) {
      clientConfig.credentials = {
        accessKeyId: cachedCredentials.accessKeyId,
        secretAccessKey: cachedCredentials.secretAccessKey,
        sessionToken: cachedCredentials.sessionToken
      };
    }
  }
  return new BedrockRuntimeClient(clientConfig);
}
const getInferenceProfileBackingModel = memoize(async function(profileId) {
  try {
    const [client, { GetInferenceProfileCommand }] = await Promise.all([
      createBedrockClient(),
      import("@aws-sdk/client-bedrock")
    ]);
    const command = new GetInferenceProfileCommand({
      inferenceProfileIdentifier: profileId
    });
    const response = await client.send(command);
    if (!response.models || response.models.length === 0) {
      return null;
    }
    const primaryModel = response.models[0];
    if (!primaryModel?.modelArn) {
      return null;
    }
    const lastSlashIndex = primaryModel.modelArn.lastIndexOf("/");
    return lastSlashIndex >= 0 ? primaryModel.modelArn.substring(lastSlashIndex + 1) : primaryModel.modelArn;
  } catch (error) {
    logError(error);
    return null;
  }
});
function isFoundationModel(modelId) {
  return modelId.startsWith("anthropic.");
}
const BEDROCK_REGION_PREFIXES = ["us", "eu", "apac", "global"];
function extractModelIdFromArn(modelId) {
  if (!modelId.startsWith("arn:")) {
    return modelId;
  }
  const lastSlashIndex = modelId.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return modelId;
  }
  return modelId.substring(lastSlashIndex + 1);
}
function getBedrockRegionPrefix(modelId) {
  const effectiveModelId = extractModelIdFromArn(modelId);
  for (const prefix of BEDROCK_REGION_PREFIXES) {
    if (effectiveModelId.startsWith(`${prefix}.anthropic.`)) {
      return prefix;
    }
  }
  return void 0;
}
function applyBedrockRegionPrefix(modelId, prefix) {
  const existingPrefix = getBedrockRegionPrefix(modelId);
  if (existingPrefix) {
    return modelId.replace(`${existingPrefix}.`, `${prefix}.`);
  }
  if (isFoundationModel(modelId)) {
    return `${prefix}.${modelId}`;
  }
  return modelId;
}
export {
  applyBedrockRegionPrefix,
  createBedrockRuntimeClient,
  extractModelIdFromArn,
  findFirstMatch,
  getBedrockInferenceProfiles,
  getBedrockRegionPrefix,
  getInferenceProfileBackingModel,
  isFoundationModel
};
