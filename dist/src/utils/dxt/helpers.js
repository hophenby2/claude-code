import { errorMessage } from "../errors.js";
import { jsonParse } from "../slowOperations.js";
async function validateManifest(manifestJson) {
  const { McpbManifestSchema } = await import("@anthropic-ai/mcpb");
  const parseResult = McpbManifestSchema.safeParse(manifestJson);
  if (!parseResult.success) {
    const errors = parseResult.error.flatten();
    const errorMessages = [
      ...Object.entries(errors.fieldErrors).map(
        ([field, errs]) => `${field}: ${errs?.join(", ")}`
      ),
      ...errors.formErrors || []
    ].filter(Boolean).join("; ");
    throw new Error(`Invalid manifest: ${errorMessages}`);
  }
  return parseResult.data;
}
async function parseAndValidateManifestFromText(manifestText) {
  let manifestJson;
  try {
    manifestJson = jsonParse(manifestText);
  } catch (error) {
    throw new Error(`Invalid JSON in manifest.json: ${errorMessage(error)}`);
  }
  return validateManifest(manifestJson);
}
async function parseAndValidateManifestFromBytes(manifestData) {
  const manifestText = new TextDecoder().decode(manifestData);
  return parseAndValidateManifestFromText(manifestText);
}
function generateExtensionId(manifest, prefix) {
  const sanitize = (str) => str.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_.]/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const authorName = manifest.author.name;
  const extensionName = manifest.name;
  const sanitizedAuthor = sanitize(authorName);
  const sanitizedName = sanitize(extensionName);
  return prefix ? `${prefix}.${sanitizedAuthor}.${sanitizedName}` : `${sanitizedAuthor}.${sanitizedName}`;
}
export {
  generateExtensionId,
  parseAndValidateManifestFromBytes,
  parseAndValidateManifestFromText,
  validateManifest
};
