import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import { getQuestionPreviewFormat } from "../../bootstrap/state.js";
import { MessageResponse } from "../../components/MessageResponse.js";
import { BLACK_CIRCLE } from "../../constants/figures.js";
import { getModeColor } from "../../utils/permissions/PermissionMode.js";
import { z } from "zod/v4";
import { Box, Text } from "../../ink.js";
import { buildTool } from "../../Tool.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { ASK_USER_QUESTION_TOOL_CHIP_WIDTH, ASK_USER_QUESTION_TOOL_NAME, ASK_USER_QUESTION_TOOL_PROMPT, DESCRIPTION, PREVIEW_FEATURE_PROMPT } from "./prompt.js";
const questionOptionSchema = lazySchema(() => z.object({
  label: z.string().describe("The display text for this option that the user will see and select. Should be concise (1-5 words) and clearly describe the choice."),
  description: z.string().describe("Explanation of what this option means or what will happen if chosen. Useful for providing context about trade-offs or implications."),
  preview: z.string().optional().describe("Optional preview content rendered when this option is focused. Use for mockups, code snippets, or visual comparisons that help users compare options. See the tool description for the expected content format.")
}));
const questionSchema = lazySchema(() => z.object({
  question: z.string().describe('The complete question to ask the user. Should be clear, specific, and end with a question mark. Example: "Which library should we use for date formatting?" If multiSelect is true, phrase it accordingly, e.g. "Which features do you want to enable?"'),
  header: z.string().describe(`Very short label displayed as a chip/tag (max ${ASK_USER_QUESTION_TOOL_CHIP_WIDTH} chars). Examples: "Auth method", "Library", "Approach".`),
  options: z.array(questionOptionSchema()).min(2).max(4).describe(`The available choices for this question. Must have 2-4 options. Each option should be a distinct, mutually exclusive choice (unless multiSelect is enabled). There should be no 'Other' option, that will be provided automatically.`),
  multiSelect: z.boolean().default(false).describe("Set to true to allow the user to select multiple options instead of just one. Use when choices are not mutually exclusive.")
}));
const annotationsSchema = lazySchema(() => {
  const annotationSchema = z.object({
    preview: z.string().optional().describe("The preview content of the selected option, if the question used previews."),
    notes: z.string().optional().describe("Free-text notes the user added to their selection.")
  });
  return z.record(z.string(), annotationSchema).optional().describe("Optional per-question annotations from the user (e.g., notes on preview selections). Keyed by question text.");
});
const UNIQUENESS_REFINE = {
  check: (data) => {
    const questions = data.questions.map((q) => q.question);
    if (questions.length !== new Set(questions).size) {
      return false;
    }
    for (const question of data.questions) {
      const labels = question.options.map((opt) => opt.label);
      if (labels.length !== new Set(labels).size) {
        return false;
      }
    }
    return true;
  },
  message: "Question texts must be unique, option labels must be unique within each question"
};
const commonFields = lazySchema(() => ({
  answers: z.record(z.string(), z.string()).optional().describe("User answers collected by the permission component"),
  annotations: annotationsSchema(),
  metadata: z.object({
    source: z.string().optional().describe('Optional identifier for the source of this question (e.g., "remember" for /remember command). Used for analytics tracking.')
  }).optional().describe("Optional metadata for tracking and analytics purposes. Not displayed to user.")
}));
const inputSchema = lazySchema(() => z.strictObject({
  questions: z.array(questionSchema()).min(1).max(4).describe("Questions to ask the user (1-4 questions)"),
  ...commonFields()
}).refine(UNIQUENESS_REFINE.check, {
  message: UNIQUENESS_REFINE.message
}));
const outputSchema = lazySchema(() => z.object({
  questions: z.array(questionSchema()).describe("The questions that were asked"),
  answers: z.record(z.string(), z.string()).describe("The answers provided by the user (question text -> answer string; multi-select answers are comma-separated)"),
  annotations: annotationsSchema()
}));
const _sdkInputSchema = inputSchema;
const _sdkOutputSchema = outputSchema;
function AskUserQuestionResultMessage(t0) {
  const $ = _c(3);
  const {
    answers
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      /* @__PURE__ */ jsxs(Text, { color: getModeColor("default"), children: [
        BLACK_CIRCLE,
        "\xA0"
      ] }),
      /* @__PURE__ */ jsx(Text, { children: "User answered Claude's questions:" })
    ] });
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== answers) {
    t2 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
      t1,
      /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: Object.entries(answers).map(_temp) }) })
    ] });
    $[1] = answers;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}
function _temp(t0) {
  const [questionText, answer] = t0;
  return /* @__PURE__ */ jsxs(Text, { color: "inactive", children: [
    "\xB7 ",
    questionText,
    " \u2192 ",
    answer
  ] }, questionText);
}
const AskUserQuestionTool = buildTool({
  name: ASK_USER_QUESTION_TOOL_NAME,
  searchHint: "prompt the user with a multiple-choice question",
  maxResultSizeChars: 1e5,
  shouldDefer: true,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    const format = getQuestionPreviewFormat();
    if (format === void 0) {
      return ASK_USER_QUESTION_TOOL_PROMPT;
    }
    return ASK_USER_QUESTION_TOOL_PROMPT + PREVIEW_FEATURE_PROMPT[format];
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  userFacingName() {
    return "";
  },
  isEnabled() {
    if (false) {
      return false;
    }
    return true;
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  toAutoClassifierInput(input) {
    return input.questions.map((q) => q.question).join(" | ");
  },
  requiresUserInteraction() {
    return true;
  },
  async validateInput({
    questions
  }) {
    if (getQuestionPreviewFormat() !== "html") {
      return {
        result: true
      };
    }
    for (const q of questions) {
      for (const opt of q.options) {
        const err = validateHtmlPreview(opt.preview);
        if (err) {
          return {
            result: false,
            message: `Option "${opt.label}" in question "${q.question}": ${err}`,
            errorCode: 1
          };
        }
      }
    }
    return {
      result: true
    };
  },
  async checkPermissions(input) {
    return {
      behavior: "ask",
      message: "Answer questions?",
      updatedInput: input
    };
  },
  renderToolUseMessage() {
    return null;
  },
  renderToolUseProgressMessage() {
    return null;
  },
  renderToolResultMessage({
    answers
  }, _toolUseID) {
    return /* @__PURE__ */ jsx(AskUserQuestionResultMessage, { answers });
  },
  renderToolUseRejectedMessage() {
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", marginTop: 1, children: [
      /* @__PURE__ */ jsxs(Text, { color: getModeColor("default"), children: [
        BLACK_CIRCLE,
        "\xA0"
      ] }),
      /* @__PURE__ */ jsx(Text, { children: "User declined to answer questions" })
    ] });
  },
  renderToolUseErrorMessage() {
    return null;
  },
  async call({
    questions,
    answers = {},
    annotations
  }, _context) {
    return {
      data: {
        questions,
        answers,
        ...annotations && {
          annotations
        }
      }
    };
  },
  mapToolResultToToolResultBlockParam({
    answers,
    annotations
  }, toolUseID) {
    const answersText = Object.entries(answers).map(([questionText, answer]) => {
      const annotation = annotations?.[questionText];
      const parts = [`"${questionText}"="${answer}"`];
      if (annotation?.preview) {
        parts.push(`selected preview:
${annotation.preview}`);
      }
      if (annotation?.notes) {
        parts.push(`user notes: ${annotation.notes}`);
      }
      return parts.join(" ");
    }).join(", ");
    return {
      type: "tool_result",
      content: `User has answered your questions: ${answersText}. You can now continue with the user's answers in mind.`,
      tool_use_id: toolUseID
    };
  }
});
function validateHtmlPreview(preview) {
  if (preview === void 0) return null;
  if (/<\s*(html|body|!doctype)\b/i.test(preview)) {
    return "preview must be an HTML fragment, not a full document (no <html>, <body>, or <!DOCTYPE>)";
  }
  if (/<\s*(script|style)\b/i.test(preview)) {
    return "preview must not contain <script> or <style> tags. Use inline styles via the style attribute if needed.";
  }
  if (!/<[a-z][^>]*>/i.test(preview)) {
    return 'preview must contain HTML (previewFormat is set to "html"). Wrap content in a tag like <div> or <pre>.';
  }
  return null;
}
export {
  AskUserQuestionTool,
  _sdkInputSchema,
  _sdkOutputSchema
};
