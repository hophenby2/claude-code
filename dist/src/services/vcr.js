import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import isPlainObject from "lodash-es/isPlainObject.js";
import mapValues from "lodash-es/mapValues.js";
import { dirname, join } from "path";
import { addToTotalSessionCost } from "../cost-tracker.js";
import { calculateUSDCost } from "../utils/modelCost.js";
import { getCwd } from "../utils/cwd.js";
import { env } from "../utils/env.js";
import { getClaudeConfigHomeDir, isEnvTruthy } from "../utils/envUtils.js";
import { getErrnoCode } from "../utils/errors.js";
import { normalizeMessagesForAPI } from "../utils/messages.js";
import { jsonParse, jsonStringify } from "../utils/slowOperations.js";
function shouldUseVCR() {
  if (process.env.NODE_ENV === "test") {
    return true;
  }
  if (process.env.USER_TYPE === "ant" && isEnvTruthy(process.env.FORCE_VCR)) {
    return true;
  }
  return false;
}
async function withFixture(input, fixtureName, f) {
  if (!shouldUseVCR()) {
    return await f();
  }
  const hash = createHash("sha1").update(jsonStringify(input)).digest("hex").slice(0, 12);
  const filename = join(
    process.env.CLAUDE_CODE_TEST_FIXTURES_ROOT ?? getCwd(),
    `fixtures/${fixtureName}-${hash}.json`
  );
  try {
    const cached = jsonParse(
      await readFile(filename, { encoding: "utf8" })
    );
    return cached;
  } catch (e) {
    const code = getErrnoCode(e);
    if (code !== "ENOENT") {
      throw e;
    }
  }
  if ((env.isCI || process.env.CI) && !isEnvTruthy(process.env.VCR_RECORD)) {
    throw new Error(
      `Fixture missing: ${filename}. Re-run tests with VCR_RECORD=1, then commit the result.`
    );
  }
  const result = await f();
  await mkdir(dirname(filename), { recursive: true });
  await writeFile(filename, jsonStringify(result, null, 2), {
    encoding: "utf8"
  });
  return result;
}
async function withVCR(messages, f) {
  if (!shouldUseVCR()) {
    return await f();
  }
  const messagesForAPI = normalizeMessagesForAPI(
    messages.filter((_) => {
      if (_.type !== "user") {
        return true;
      }
      if (_.isMeta) {
        return false;
      }
      return true;
    })
  );
  const dehydratedInput = mapMessages(
    messagesForAPI.map((_) => _.message.content),
    dehydrateValue
  );
  const filename = join(
    process.env.CLAUDE_CODE_TEST_FIXTURES_ROOT ?? getCwd(),
    `fixtures/${dehydratedInput.map((_) => createHash("sha1").update(jsonStringify(_)).digest("hex").slice(0, 6)).join("-")}.json`
  );
  try {
    const cached = jsonParse(
      await readFile(filename, { encoding: "utf8" })
    );
    cached.output.forEach(addCachedCostToTotalSessionCost);
    return cached.output.map(
      (message, index) => mapMessage(message, hydrateValue, index, randomUUID())
    );
  } catch (e) {
    const code = getErrnoCode(e);
    if (code !== "ENOENT") {
      throw e;
    }
  }
  if (env.isCI && !isEnvTruthy(process.env.VCR_RECORD)) {
    throw new Error(
      `Anthropic API fixture missing: ${filename}. Re-run tests with VCR_RECORD=1, then commit the result. Input messages:
${jsonStringify(dehydratedInput, null, 2)}`
    );
  }
  const results = await f();
  if (env.isCI && !isEnvTruthy(process.env.VCR_RECORD)) {
    return results;
  }
  await mkdir(dirname(filename), { recursive: true });
  await writeFile(
    filename,
    jsonStringify(
      {
        input: dehydratedInput,
        output: results.map(
          (message, index) => mapMessage(message, dehydrateValue, index)
        )
      },
      null,
      2
    ),
    { encoding: "utf8" }
  );
  return results;
}
function addCachedCostToTotalSessionCost(message) {
  if (message.type === "stream_event") {
    return;
  }
  const model = message.message.model;
  const usage = message.message.usage;
  const costUSD = calculateUSDCost(model, usage);
  addToTotalSessionCost(costUSD, usage, model);
}
function mapMessages(messages, f) {
  return messages.map((_) => {
    if (typeof _ === "string") {
      return f(_);
    }
    return _.map((_2) => {
      switch (_2.type) {
        case "tool_result":
          if (typeof _2.content === "string") {
            return { ..._2, content: f(_2.content) };
          }
          if (Array.isArray(_2.content)) {
            return {
              ..._2,
              content: _2.content.map((_3) => {
                switch (_3.type) {
                  case "text":
                    return { ..._3, text: f(_3.text) };
                  case "image":
                    return _3;
                  default:
                    return void 0;
                }
              })
            };
          }
          return _2;
        case "text":
          return { ..._2, text: f(_2.text) };
        case "tool_use":
          return {
            ..._2,
            input: mapValuesDeep(_2.input, f)
          };
        case "image":
          return _2;
        default:
          return void 0;
      }
    });
  });
}
function mapValuesDeep(obj, f) {
  return mapValues(obj, (val, key) => {
    if (Array.isArray(val)) {
      return val.map((_) => mapValuesDeep(_, f));
    }
    if (isPlainObject(val)) {
      return mapValuesDeep(val, f);
    }
    return f(val, key, obj);
  });
}
function mapAssistantMessage(message, f, index, uuid) {
  return {
    // Use provided UUID if given (hydrate path uses randomUUID for globally unique IDs),
    // otherwise fall back to deterministic index-based UUID (dehydrate/fixture path).
    // sessionStorage.ts deduplicates messages by UUID, so without unique UUIDs across
    // VCR calls, resumed sessions would treat different responses as duplicates.
    uuid: uuid ?? `UUID-${index}`,
    requestId: "REQUEST_ID",
    timestamp: message.timestamp,
    message: {
      ...message.message,
      content: message.message.content.map((_) => {
        switch (_.type) {
          case "text":
            return {
              ..._,
              text: f(_.text),
              citations: _.citations || []
            };
          // Ensure citations
          case "tool_use":
            return {
              ..._,
              input: mapValuesDeep(_.input, f)
            };
          default:
            return _;
        }
      }).filter(Boolean)
    },
    type: "assistant"
  };
}
function mapMessage(message, f, index, uuid) {
  if (message.type === "assistant") {
    return mapAssistantMessage(message, f, index, uuid);
  } else {
    return message;
  }
}
function dehydrateValue(s) {
  if (typeof s !== "string") {
    return s;
  }
  const cwd = getCwd();
  const configHome = getClaudeConfigHomeDir();
  let s1 = s.replace(/num_files="\d+"/g, 'num_files="[NUM]"').replace(/duration_ms="\d+"/g, 'duration_ms="[DURATION]"').replace(/cost_usd="\d+"/g, 'cost_usd="[COST]"').replaceAll(configHome, "[CONFIG_HOME]").replaceAll(cwd, "[CWD]").replace(/Available commands:.+/, "Available commands: [COMMANDS]");
  if (process.platform === "win32") {
    const cwdFwd = cwd.replaceAll("\\", "/");
    const configHomeFwd = configHome.replaceAll("\\", "/");
    const cwdJsonEscaped = jsonStringify(cwd).slice(1, -1);
    const configHomeJsonEscaped = jsonStringify(configHome).slice(1, -1);
    s1 = s1.replaceAll(cwdJsonEscaped, "[CWD]").replaceAll(configHomeJsonEscaped, "[CONFIG_HOME]").replaceAll(cwdFwd, "[CWD]").replaceAll(configHomeFwd, "[CONFIG_HOME]");
  }
  s1 = s1.replace(
    /\[CWD\][^\s"'<>]*/g,
    (match) => match.replaceAll("\\\\", "/").replaceAll("\\", "/")
  ).replace(
    /\[CONFIG_HOME\][^\s"'<>]*/g,
    (match) => match.replaceAll("\\\\", "/").replaceAll("\\", "/")
  );
  if (s1.includes("Files modified by user:")) {
    return "Files modified by user: [FILES]";
  }
  return s1;
}
function hydrateValue(s) {
  if (typeof s !== "string") {
    return s;
  }
  return s.replaceAll("[NUM]", "1").replaceAll("[DURATION]", "100").replaceAll("[CONFIG_HOME]", getClaudeConfigHomeDir()).replaceAll("[CWD]", getCwd());
}
async function* withStreamingVCR(messages, f) {
  if (!shouldUseVCR()) {
    return yield* f();
  }
  const buffer = [];
  const cachedBuffer = await withVCR(messages, async () => {
    for await (const message of f()) {
      buffer.push(message);
    }
    return buffer;
  });
  if (cachedBuffer.length > 0) {
    yield* cachedBuffer;
    return;
  }
  yield* buffer;
}
async function withTokenCountVCR(messages, tools, f) {
  const cwdSlug = getCwd().replace(/[^a-zA-Z0-9]/g, "-");
  const dehydrated = dehydrateValue(jsonStringify({ messages, tools })).replaceAll(cwdSlug, "[CWD_SLUG]").replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "[UUID]"
  ).replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, "[TIMESTAMP]");
  const result = await withFixture(dehydrated, "token-count", async () => ({
    tokenCount: await f()
  }));
  return result.tokenCount;
}
export {
  withStreamingVCR,
  withTokenCountVCR,
  withVCR
};
