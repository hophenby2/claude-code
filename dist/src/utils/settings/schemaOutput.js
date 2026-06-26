import { toJSONSchema } from "zod/v4";
import { jsonStringify } from "../slowOperations.js";
import { SettingsSchema } from "./types.js";
function generateSettingsJSONSchema() {
  const jsonSchema = toJSONSchema(SettingsSchema(), { unrepresentable: "any" });
  return jsonStringify(jsonSchema, null, 2);
}
export {
  generateSettingsJSONSchema
};
