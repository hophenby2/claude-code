import { z } from "zod/v4";
import { jsonStringify } from "../slowOperations.js";
import { plural } from "../stringUtils.js";
import {
  looksLikeISO8601,
  parseNaturalLanguageDateTime
} from "./dateTimeParser.js";
const STRING_FORMATS = {
  email: {
    description: "email address",
    example: "user@example.com"
  },
  uri: {
    description: "URI",
    example: "https://example.com"
  },
  date: {
    description: "date",
    example: "2024-03-15"
  },
  "date-time": {
    description: "date-time",
    example: "2024-03-15T14:30:00Z"
  }
};
const isEnumSchema = (schema) => {
  return schema.type === "string" && ("enum" in schema || "oneOf" in schema);
};
function isMultiSelectEnumSchema(schema) {
  return schema.type === "array" && "items" in schema && typeof schema.items === "object" && schema.items !== null && ("enum" in schema.items || "anyOf" in schema.items);
}
function getMultiSelectValues(schema) {
  if ("anyOf" in schema.items) {
    return schema.items.anyOf.map((item) => item.const);
  }
  if ("enum" in schema.items) {
    return schema.items.enum;
  }
  return [];
}
function getMultiSelectLabels(schema) {
  if ("anyOf" in schema.items) {
    return schema.items.anyOf.map((item) => item.title);
  }
  if ("enum" in schema.items) {
    return schema.items.enum;
  }
  return [];
}
function getMultiSelectLabel(schema, value) {
  const index = getMultiSelectValues(schema).indexOf(value);
  return index >= 0 ? getMultiSelectLabels(schema)[index] ?? value : value;
}
function getEnumValues(schema) {
  if ("oneOf" in schema) {
    return schema.oneOf.map((item) => item.const);
  }
  if ("enum" in schema) {
    return schema.enum;
  }
  return [];
}
function getEnumLabels(schema) {
  if ("oneOf" in schema) {
    return schema.oneOf.map((item) => item.title);
  }
  if ("enum" in schema) {
    return ("enumNames" in schema ? schema.enumNames : void 0) ?? schema.enum;
  }
  return [];
}
function getEnumLabel(schema, value) {
  const index = getEnumValues(schema).indexOf(value);
  return index >= 0 ? getEnumLabels(schema)[index] ?? value : value;
}
function getZodSchema(schema) {
  if (isEnumSchema(schema)) {
    const [first, ...rest] = getEnumValues(schema);
    if (!first) {
      return z.never();
    }
    return z.enum([first, ...rest]);
  }
  if (schema.type === "string") {
    let stringSchema = z.string();
    if (schema.minLength !== void 0) {
      stringSchema = stringSchema.min(schema.minLength, {
        message: `Must be at least ${schema.minLength} ${plural(schema.minLength, "character")}`
      });
    }
    if (schema.maxLength !== void 0) {
      stringSchema = stringSchema.max(schema.maxLength, {
        message: `Must be at most ${schema.maxLength} ${plural(schema.maxLength, "character")}`
      });
    }
    switch (schema.format) {
      case "email":
        stringSchema = stringSchema.email({
          message: "Must be a valid email address, e.g. user@example.com"
        });
        break;
      case "uri":
        stringSchema = stringSchema.url({
          message: "Must be a valid URI, e.g. https://example.com"
        });
        break;
      case "date":
        stringSchema = stringSchema.date(
          "Must be a valid date, e.g. 2024-03-15, today, next Monday"
        );
        break;
      case "date-time":
        stringSchema = stringSchema.datetime({
          offset: true,
          message: "Must be a valid date-time, e.g. 2024-03-15T14:30:00Z, tomorrow at 3pm"
        });
        break;
      default:
        break;
    }
    return stringSchema;
  }
  if (schema.type === "number" || schema.type === "integer") {
    const typeLabel = schema.type === "integer" ? "an integer" : "a number";
    const isInteger = schema.type === "integer";
    const formatNum = (n) => Number.isInteger(n) && !isInteger ? `${n}.0` : String(n);
    const rangeMsg = schema.minimum !== void 0 && schema.maximum !== void 0 ? `Must be ${typeLabel} between ${formatNum(schema.minimum)} and ${formatNum(schema.maximum)}` : schema.minimum !== void 0 ? `Must be ${typeLabel} >= ${formatNum(schema.minimum)}` : schema.maximum !== void 0 ? `Must be ${typeLabel} <= ${formatNum(schema.maximum)}` : `Must be ${typeLabel}`;
    let numberSchema = z.coerce.number({
      error: rangeMsg
    });
    if (schema.type === "integer") {
      numberSchema = numberSchema.int({ message: rangeMsg });
    }
    if (schema.minimum !== void 0) {
      numberSchema = numberSchema.min(schema.minimum, {
        message: rangeMsg
      });
    }
    if (schema.maximum !== void 0) {
      numberSchema = numberSchema.max(schema.maximum, {
        message: rangeMsg
      });
    }
    return numberSchema;
  }
  if (schema.type === "boolean") {
    return z.coerce.boolean();
  }
  throw new Error(`Unsupported schema: ${jsonStringify(schema)}`);
}
function validateElicitationInput(stringValue, schema) {
  const zodSchema = getZodSchema(schema);
  const parseResult = zodSchema.safeParse(stringValue);
  if (parseResult.success) {
    return {
      value: parseResult.data,
      isValid: true
    };
  }
  return {
    isValid: false,
    error: parseResult.error.issues.map((e) => e.message).join("; ")
  };
}
const hasStringFormat = (schema) => {
  return schema.type === "string" && "format" in schema && typeof schema.format === "string";
};
function getFormatHint(schema) {
  if (schema.type === "string") {
    if (!hasStringFormat(schema)) {
      return void 0;
    }
    const { description, example } = STRING_FORMATS[schema.format] || {};
    return `${description}, e.g. ${example}`;
  }
  if (schema.type === "number" || schema.type === "integer") {
    const isInteger = schema.type === "integer";
    const formatNum = (n) => Number.isInteger(n) && !isInteger ? `${n}.0` : String(n);
    if (schema.minimum !== void 0 && schema.maximum !== void 0) {
      return `(${schema.type} between ${formatNum(schema.minimum)} and ${formatNum(schema.maximum)})`;
    } else if (schema.minimum !== void 0) {
      return `(${schema.type} >= ${formatNum(schema.minimum)})`;
    } else if (schema.maximum !== void 0) {
      return `(${schema.type} <= ${formatNum(schema.maximum)})`;
    } else {
      const example = schema.type === "integer" ? "42" : "3.14";
      return `(${schema.type}, e.g. ${example})`;
    }
  }
  return void 0;
}
function isDateTimeSchema(schema) {
  return schema.type === "string" && "format" in schema && (schema.format === "date" || schema.format === "date-time");
}
async function validateElicitationInputAsync(stringValue, schema, signal) {
  const syncResult = validateElicitationInput(stringValue, schema);
  if (syncResult.isValid) {
    return syncResult;
  }
  if (isDateTimeSchema(schema) && !looksLikeISO8601(stringValue)) {
    const parseResult = await parseNaturalLanguageDateTime(
      stringValue,
      schema.format,
      signal
    );
    if (parseResult.success) {
      const validatedParsed = validateElicitationInput(
        parseResult.value,
        schema
      );
      if (validatedParsed.isValid) {
        return validatedParsed;
      }
    }
  }
  return syncResult;
}
export {
  getEnumLabel,
  getEnumLabels,
  getEnumValues,
  getFormatHint,
  getMultiSelectLabel,
  getMultiSelectLabels,
  getMultiSelectValues,
  isDateTimeSchema,
  isEnumSchema,
  isMultiSelectEnumSchema,
  validateElicitationInput,
  validateElicitationInputAsync
};
