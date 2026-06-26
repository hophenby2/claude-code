import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRegisterOverlay } from "../../context/overlayContext.js";
import { useNotifyAfterTimeout } from "../../hooks/useNotifyAfterTimeout.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { Box, Text, useInput } from "../../ink.js";
import { useKeybinding } from "../../keybindings/useKeybinding.js";
import { openBrowser } from "../../utils/browser.js";
import { getEnumLabel, getEnumValues, getMultiSelectLabel, getMultiSelectValues, isDateTimeSchema, isEnumSchema, isMultiSelectEnumSchema, validateElicitationInput, validateElicitationInputAsync } from "../../utils/mcp/elicitationValidation.js";
import { plural } from "../../utils/stringUtils.js";
import { ConfigurableShortcutHint } from "../ConfigurableShortcutHint.js";
import { Byline } from "../design-system/Byline.js";
import { Dialog } from "../design-system/Dialog.js";
import { KeyboardShortcutHint } from "../design-system/KeyboardShortcutHint.js";
import TextInput from "../TextInput.js";
const isTextField = (s) => ["string", "number", "integer"].includes(s.type);
const RESOLVING_SPINNER_CHARS = "\u280B\u2819\u2839\u2838\u283C\u2834\u2826\u2827\u2807\u280F";
const advanceSpinnerFrame = (f) => (f + 1) % RESOLVING_SPINNER_CHARS.length;
function resetTypeahead(ta) {
  ta.buffer = "";
  ta.timer = void 0;
}
function ResolvingSpinner() {
  const $ = _c(4);
  const [frame, setFrame] = useState(0);
  let t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t0 = () => {
      const timer = setInterval(setFrame, 80, advanceSpinnerFrame);
      return () => clearInterval(timer);
    };
    t1 = [];
    $[0] = t0;
    $[1] = t1;
  } else {
    t0 = $[0];
    t1 = $[1];
  }
  useEffect(t0, t1);
  const t2 = RESOLVING_SPINNER_CHARS[frame];
  let t3;
  if ($[2] !== t2) {
    t3 = /* @__PURE__ */ jsx(Text, { color: "warning", children: t2 });
    $[2] = t2;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  return t3;
}
function formatDateDisplay(isoValue, schema) {
  try {
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime())) return isoValue;
    const format = "format" in schema ? schema.format : void 0;
    if (format === "date-time") {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short"
      });
    }
    const parts = isoValue.split("-");
    if (parts.length === 3) {
      const local = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return local.toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    }
    return isoValue;
  } catch {
    return isoValue;
  }
}
function ElicitationDialog(t0) {
  const $ = _c(7);
  const {
    event,
    onResponse,
    onWaitingDismiss
  } = t0;
  if (event.params.mode === "url") {
    let t12;
    if ($[0] !== event || $[1] !== onResponse || $[2] !== onWaitingDismiss) {
      t12 = /* @__PURE__ */ jsx(ElicitationURLDialog, { event, onResponse, onWaitingDismiss });
      $[0] = event;
      $[1] = onResponse;
      $[2] = onWaitingDismiss;
      $[3] = t12;
    } else {
      t12 = $[3];
    }
    return t12;
  }
  let t1;
  if ($[4] !== event || $[5] !== onResponse) {
    t1 = /* @__PURE__ */ jsx(ElicitationFormDialog, { event, onResponse });
    $[4] = event;
    $[5] = onResponse;
    $[6] = t1;
  } else {
    t1 = $[6];
  }
  return t1;
}
function ElicitationFormDialog({
  event,
  onResponse
}) {
  const {
    serverName,
    signal
  } = event;
  const request = event.params;
  const {
    message,
    requestedSchema
  } = request;
  const hasFields = Object.keys(requestedSchema.properties).length > 0;
  const [focusedButton, setFocusedButton] = useState(hasFields ? null : "accept");
  const [formValues, setFormValues] = useState(() => {
    const initialValues = {};
    if (requestedSchema.properties) {
      for (const [propName, propSchema] of Object.entries(requestedSchema.properties)) {
        if (typeof propSchema === "object" && propSchema !== null) {
          if (propSchema.default !== void 0) {
            initialValues[propName] = propSchema.default;
          }
        }
      }
    }
    return initialValues;
  });
  const [validationErrors, setValidationErrors] = useState(() => {
    const initialErrors = {};
    for (const [propName_0, propSchema_0] of Object.entries(requestedSchema.properties)) {
      if (isTextField(propSchema_0) && propSchema_0?.default !== void 0) {
        const validation = validateElicitationInput(String(propSchema_0.default), propSchema_0);
        if (!validation.isValid && validation.error) {
          initialErrors[propName_0] = validation.error;
        }
      }
    }
    return initialErrors;
  });
  useEffect(() => {
    if (!signal) return;
    const handleAbort = () => {
      onResponse("cancel");
    };
    if (signal.aborted) {
      handleAbort();
      return;
    }
    signal.addEventListener("abort", handleAbort);
    return () => {
      signal.removeEventListener("abort", handleAbort);
    };
  }, [signal, onResponse]);
  const schemaFields = useMemo(() => {
    const requiredFields = requestedSchema.required ?? [];
    return Object.entries(requestedSchema.properties).map(([name, schema]) => ({
      name,
      schema,
      isRequired: requiredFields.includes(name)
    }));
  }, [requestedSchema]);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(hasFields ? 0 : void 0);
  const [textInputValue, setTextInputValue] = useState(() => {
    const firstField = schemaFields[0];
    if (firstField && isTextField(firstField.schema)) {
      const val = formValues[firstField.name];
      if (val === void 0) return "";
      return String(val);
    }
    return "";
  });
  const [textInputCursorOffset, setTextInputCursorOffset] = useState(textInputValue.length);
  const [resolvingFields, setResolvingFields] = useState(() => /* @__PURE__ */ new Set());
  const [expandedAccordion, setExpandedAccordion] = useState();
  const [accordionOptionIndex, setAccordionOptionIndex] = useState(0);
  const dateDebounceRef = useRef(void 0);
  const resolveAbortRef = useRef(/* @__PURE__ */ new Map());
  const enumTypeaheadRef = useRef({
    buffer: "",
    timer: void 0
  });
  useEffect(() => () => {
    if (dateDebounceRef.current !== void 0) {
      clearTimeout(dateDebounceRef.current);
    }
    const ta = enumTypeaheadRef.current;
    if (ta.timer !== void 0) {
      clearTimeout(ta.timer);
    }
    for (const controller of resolveAbortRef.current.values()) {
      controller.abort();
    }
    resolveAbortRef.current.clear();
  }, []);
  const {
    columns,
    rows
  } = useTerminalSize();
  const currentField = currentFieldIndex !== void 0 ? schemaFields[currentFieldIndex] : void 0;
  const currentFieldIsText = currentField !== void 0 && isTextField(currentField.schema) && !isEnumSchema(currentField.schema);
  const isEditingTextField = currentFieldIsText && !focusedButton;
  useRegisterOverlay("elicitation");
  useNotifyAfterTimeout("Claude Code needs your input", "elicitation_dialog");
  const syncTextInput = useCallback((fieldIndex) => {
    if (fieldIndex === void 0) {
      setTextInputValue("");
      setTextInputCursorOffset(0);
      return;
    }
    const field = schemaFields[fieldIndex];
    if (field && isTextField(field.schema) && !isEnumSchema(field.schema)) {
      const val_0 = formValues[field.name];
      const text = val_0 !== void 0 ? String(val_0) : "";
      setTextInputValue(text);
      setTextInputCursorOffset(text.length);
    }
  }, [schemaFields, formValues]);
  function validateMultiSelect(fieldName, schema_0) {
    if (!isMultiSelectEnumSchema(schema_0)) return;
    const selected = formValues[fieldName] ?? [];
    const fieldRequired = schemaFields.find((f) => f.name === fieldName)?.isRequired ?? false;
    const min = schema_0.minItems;
    const max = schema_0.maxItems;
    if (min !== void 0 && selected.length < min && (selected.length > 0 || fieldRequired)) {
      updateValidationError(fieldName, `Select at least ${min} ${plural(min, "item")}`);
    } else if (max !== void 0 && selected.length > max) {
      updateValidationError(fieldName, `Select at most ${max} ${plural(max, "item")}`);
    } else {
      updateValidationError(fieldName);
    }
  }
  function handleNavigation(direction) {
    if (currentField && isMultiSelectEnumSchema(currentField.schema)) {
      validateMultiSelect(currentField.name, currentField.schema);
      setExpandedAccordion(void 0);
    } else if (currentField && isEnumSchema(currentField.schema)) {
      setExpandedAccordion(void 0);
    }
    if (isEditingTextField && currentField) {
      commitTextField(currentField.name, currentField.schema, textInputValue);
      if (dateDebounceRef.current !== void 0) {
        clearTimeout(dateDebounceRef.current);
        dateDebounceRef.current = void 0;
      }
      if (isDateTimeSchema(currentField.schema) && textInputValue.trim() !== "" && validationErrors[currentField.name]) {
        resolveFieldAsync(currentField.name, currentField.schema, textInputValue);
      }
    }
    const itemCount = schemaFields.length + 2;
    const index = currentFieldIndex ?? (focusedButton === "accept" ? schemaFields.length : focusedButton === "decline" ? schemaFields.length + 1 : void 0);
    const nextIndex = index !== void 0 ? (index + (direction === "up" ? itemCount - 1 : 1)) % itemCount : 0;
    if (nextIndex < schemaFields.length) {
      setCurrentFieldIndex(nextIndex);
      setFocusedButton(null);
      syncTextInput(nextIndex);
    } else {
      setCurrentFieldIndex(void 0);
      setFocusedButton(nextIndex === schemaFields.length ? "accept" : "decline");
      setTextInputValue("");
    }
  }
  function setField(fieldName_0, value) {
    setFormValues((prev) => {
      const next = {
        ...prev
      };
      if (value === void 0) {
        delete next[fieldName_0];
      } else {
        next[fieldName_0] = value;
      }
      return next;
    });
    if (value !== void 0 && validationErrors[fieldName_0] === "This field is required") {
      updateValidationError(fieldName_0);
    }
  }
  function updateValidationError(fieldName_1, error) {
    setValidationErrors((prev_0) => {
      const next_0 = {
        ...prev_0
      };
      if (error) {
        next_0[fieldName_1] = error;
      } else {
        delete next_0[fieldName_1];
      }
      return next_0;
    });
  }
  function unsetField(fieldName_2) {
    if (!fieldName_2) return;
    setField(fieldName_2, void 0);
    updateValidationError(fieldName_2);
    setTextInputValue("");
    setTextInputCursorOffset(0);
  }
  function commitTextField(fieldName_3, schema_1, value_0) {
    const trimmedValue = value_0.trim();
    if (trimmedValue === "" && (schema_1.type !== "string" || "format" in schema_1 && schema_1.format !== void 0)) {
      unsetField(fieldName_3);
      return;
    }
    if (trimmedValue === "") {
      if (formValues[fieldName_3] !== void 0) {
        setField(fieldName_3, "");
      }
      return;
    }
    const validation_0 = validateElicitationInput(value_0, schema_1);
    setField(fieldName_3, validation_0.isValid ? validation_0.value : value_0);
    updateValidationError(fieldName_3, validation_0.isValid ? void 0 : validation_0.error);
  }
  function resolveFieldAsync(fieldName_4, schema_2, rawValue) {
    if (!signal) return;
    const existing = resolveAbortRef.current.get(fieldName_4);
    if (existing) {
      existing.abort();
    }
    const controller_0 = new AbortController();
    resolveAbortRef.current.set(fieldName_4, controller_0);
    setResolvingFields((prev_1) => new Set(prev_1).add(fieldName_4));
    void validateElicitationInputAsync(rawValue, schema_2, controller_0.signal).then((result) => {
      resolveAbortRef.current.delete(fieldName_4);
      setResolvingFields((prev_2) => {
        const next_1 = new Set(prev_2);
        next_1.delete(fieldName_4);
        return next_1;
      });
      if (controller_0.signal.aborted) return;
      if (result.isValid) {
        setField(fieldName_4, result.value);
        updateValidationError(fieldName_4);
        const isoText = String(result.value);
        setTextInputValue((prev_3) => {
          if (prev_3 === rawValue) {
            setTextInputCursorOffset(isoText.length);
            return isoText;
          }
          return prev_3;
        });
      } else {
        updateValidationError(fieldName_4, result.error);
      }
    }, () => {
      resolveAbortRef.current.delete(fieldName_4);
      setResolvingFields((prev_4) => {
        const next_2 = new Set(prev_4);
        next_2.delete(fieldName_4);
        return next_2;
      });
    });
  }
  function handleTextInputChange(newValue) {
    setTextInputValue(newValue);
    if (currentField) {
      commitTextField(currentField.name, currentField.schema, newValue);
      if (dateDebounceRef.current !== void 0) {
        clearTimeout(dateDebounceRef.current);
        dateDebounceRef.current = void 0;
      }
      if (isDateTimeSchema(currentField.schema) && newValue.trim() !== "" && validationErrors[currentField.name]) {
        const fieldName_5 = currentField.name;
        const schema_3 = currentField.schema;
        dateDebounceRef.current = setTimeout((dateDebounceRef_0, resolveFieldAsync_0, fieldName_6, schema_4, newValue_0) => {
          dateDebounceRef_0.current = void 0;
          resolveFieldAsync_0(fieldName_6, schema_4, newValue_0);
        }, 2e3, dateDebounceRef, resolveFieldAsync, fieldName_5, schema_3, newValue);
      }
    }
  }
  function handleTextInputSubmit() {
    handleNavigation("down");
  }
  function runTypeahead(char, labels, onMatch) {
    const ta_0 = enumTypeaheadRef.current;
    if (ta_0.timer !== void 0) clearTimeout(ta_0.timer);
    ta_0.buffer += char.toLowerCase();
    ta_0.timer = setTimeout(resetTypeahead, 2e3, ta_0);
    const match = labels.findIndex((l) => l.startsWith(ta_0.buffer));
    if (match !== -1) onMatch(match);
  }
  useKeybinding("confirm:no", () => {
    if (isEditingTextField && currentField) {
      const val_1 = formValues[currentField.name];
      setTextInputValue(val_1 !== void 0 ? String(val_1) : "");
      setTextInputCursorOffset(0);
    }
    onResponse("cancel");
  }, {
    context: "Settings",
    isActive: !!currentField && !focusedButton && !expandedAccordion
  });
  useInput((_input, key) => {
    if (isEditingTextField && !key.upArrow && !key.downArrow && !key.return && !key.backspace) {
      return;
    }
    if (expandedAccordion && currentField && isMultiSelectEnumSchema(currentField.schema)) {
      const msSchema = currentField.schema;
      const msValues = getMultiSelectValues(msSchema);
      const selected_0 = formValues[currentField.name] ?? [];
      if (key.leftArrow || key.escape) {
        setExpandedAccordion(void 0);
        validateMultiSelect(currentField.name, msSchema);
        return;
      }
      if (key.upArrow) {
        if (accordionOptionIndex === 0) {
          setExpandedAccordion(void 0);
          validateMultiSelect(currentField.name, msSchema);
        } else {
          setAccordionOptionIndex(accordionOptionIndex - 1);
        }
        return;
      }
      if (key.downArrow) {
        if (accordionOptionIndex >= msValues.length - 1) {
          setExpandedAccordion(void 0);
          handleNavigation("down");
        } else {
          setAccordionOptionIndex(accordionOptionIndex + 1);
        }
        return;
      }
      if (_input === " ") {
        const optionValue = msValues[accordionOptionIndex];
        if (optionValue !== void 0) {
          const newSelected = selected_0.includes(optionValue) ? selected_0.filter((v) => v !== optionValue) : [...selected_0, optionValue];
          const newValue_1 = newSelected.length > 0 ? newSelected : void 0;
          setField(currentField.name, newValue_1);
          const min_0 = msSchema.minItems;
          const max_0 = msSchema.maxItems;
          if (min_0 !== void 0 && newSelected.length < min_0 && (newSelected.length > 0 || currentField.isRequired)) {
            updateValidationError(currentField.name, `Select at least ${min_0} ${plural(min_0, "item")}`);
          } else if (max_0 !== void 0 && newSelected.length > max_0) {
            updateValidationError(currentField.name, `Select at most ${max_0} ${plural(max_0, "item")}`);
          } else {
            updateValidationError(currentField.name);
          }
        }
        return;
      }
      if (key.return) {
        const optionValue_0 = msValues[accordionOptionIndex];
        if (optionValue_0 !== void 0 && !selected_0.includes(optionValue_0)) {
          setField(currentField.name, [...selected_0, optionValue_0]);
        }
        setExpandedAccordion(void 0);
        handleNavigation("down");
        return;
      }
      if (_input) {
        const labels_0 = msValues.map((v_0) => getMultiSelectLabel(msSchema, v_0).toLowerCase());
        runTypeahead(_input, labels_0, setAccordionOptionIndex);
        return;
      }
      return;
    }
    if (expandedAccordion && currentField && isEnumSchema(currentField.schema)) {
      const enumSchema = currentField.schema;
      const enumValues = getEnumValues(enumSchema);
      if (key.leftArrow || key.escape) {
        setExpandedAccordion(void 0);
        return;
      }
      if (key.upArrow) {
        if (accordionOptionIndex === 0) {
          setExpandedAccordion(void 0);
        } else {
          setAccordionOptionIndex(accordionOptionIndex - 1);
        }
        return;
      }
      if (key.downArrow) {
        if (accordionOptionIndex >= enumValues.length - 1) {
          setExpandedAccordion(void 0);
          handleNavigation("down");
        } else {
          setAccordionOptionIndex(accordionOptionIndex + 1);
        }
        return;
      }
      if (_input === " ") {
        const optionValue_1 = enumValues[accordionOptionIndex];
        if (optionValue_1 !== void 0) {
          setField(currentField.name, optionValue_1);
        }
        setExpandedAccordion(void 0);
        return;
      }
      if (key.return) {
        const optionValue_2 = enumValues[accordionOptionIndex];
        if (optionValue_2 !== void 0) {
          setField(currentField.name, optionValue_2);
        }
        setExpandedAccordion(void 0);
        handleNavigation("down");
        return;
      }
      if (_input) {
        const labels_1 = enumValues.map((v_1) => getEnumLabel(enumSchema, v_1).toLowerCase());
        runTypeahead(_input, labels_1, setAccordionOptionIndex);
        return;
      }
      return;
    }
    if (key.return && focusedButton === "accept") {
      if (validateRequired() && Object.keys(validationErrors).length === 0) {
        onResponse("accept", formValues);
      } else {
        const requiredFields_0 = requestedSchema.required || [];
        for (const fieldName_7 of requiredFields_0) {
          if (formValues[fieldName_7] === void 0) {
            updateValidationError(fieldName_7, "This field is required");
          }
        }
        const firstBadIndex = schemaFields.findIndex((f_0) => requiredFields_0.includes(f_0.name) && formValues[f_0.name] === void 0 || validationErrors[f_0.name] !== void 0);
        if (firstBadIndex !== -1) {
          setCurrentFieldIndex(firstBadIndex);
          setFocusedButton(null);
          syncTextInput(firstBadIndex);
        }
      }
      return;
    }
    if (key.return && focusedButton === "decline") {
      onResponse("decline");
      return;
    }
    if (key.upArrow || key.downArrow) {
      const ta_1 = enumTypeaheadRef.current;
      ta_1.buffer = "";
      if (ta_1.timer !== void 0) {
        clearTimeout(ta_1.timer);
        ta_1.timer = void 0;
      }
      handleNavigation(key.upArrow ? "up" : "down");
      return;
    }
    if (focusedButton && (key.leftArrow || key.rightArrow)) {
      setFocusedButton(focusedButton === "accept" ? "decline" : "accept");
      return;
    }
    if (!currentField) return;
    const {
      schema: schema_5,
      name: name_0
    } = currentField;
    const value_1 = formValues[name_0];
    if (schema_5.type === "boolean") {
      if (_input === " ") {
        setField(name_0, value_1 === void 0 ? true : !value_1);
        return;
      }
      if (key.return) {
        handleNavigation("down");
        return;
      }
      if (key.backspace && value_1 !== void 0) {
        unsetField(name_0);
        return;
      }
      if (_input && !key.return) {
        runTypeahead(_input, ["yes", "no"], (i) => setField(name_0, i === 0));
        return;
      }
      return;
    }
    if (isEnumSchema(schema_5) || isMultiSelectEnumSchema(schema_5)) {
      if (key.return) {
        handleNavigation("down");
        return;
      }
      if (key.backspace && value_1 !== void 0) {
        unsetField(name_0);
        return;
      }
      let labels_2;
      let startIdx = 0;
      if (isEnumSchema(schema_5)) {
        const vals = getEnumValues(schema_5);
        labels_2 = vals.map((v_2) => getEnumLabel(schema_5, v_2).toLowerCase());
        if (value_1 !== void 0) {
          startIdx = Math.max(0, vals.indexOf(value_1));
        }
      } else {
        const vals_0 = getMultiSelectValues(schema_5);
        labels_2 = vals_0.map((v_3) => getMultiSelectLabel(schema_5, v_3).toLowerCase());
      }
      if (key.rightArrow) {
        setExpandedAccordion(name_0);
        setAccordionOptionIndex(startIdx);
        return;
      }
      if (_input && !key.leftArrow) {
        runTypeahead(_input, labels_2, (i_0) => {
          setExpandedAccordion(name_0);
          setAccordionOptionIndex(i_0);
        });
        return;
      }
      return;
    }
    if (key.backspace) {
      if (isEditingTextField && textInputValue === "") {
        unsetField(name_0);
        return;
      }
    }
  }, {
    isActive: true
  });
  function validateRequired() {
    const requiredFields_1 = requestedSchema.required || [];
    for (const fieldName_8 of requiredFields_1) {
      const value_2 = formValues[fieldName_8];
      if (value_2 === void 0 || value_2 === null || value_2 === "") {
        return false;
      }
      if (Array.isArray(value_2) && value_2.length === 0) {
        return false;
      }
    }
    return true;
  }
  const LINES_PER_FIELD = 3;
  const DIALOG_OVERHEAD = 14;
  const maxVisibleFields = Math.max(2, Math.floor((rows - DIALOG_OVERHEAD) / LINES_PER_FIELD));
  const scrollWindow = useMemo(() => {
    const total = schemaFields.length;
    if (total <= maxVisibleFields) {
      return {
        start: 0,
        end: total
      };
    }
    const focusIdx = currentFieldIndex ?? total - 1;
    let start = Math.max(0, focusIdx - Math.floor(maxVisibleFields / 2));
    const end = Math.min(start + maxVisibleFields, total);
    start = Math.max(0, end - maxVisibleFields);
    return {
      start,
      end
    };
  }, [schemaFields.length, maxVisibleFields, currentFieldIndex]);
  const hasFieldsAbove = scrollWindow.start > 0;
  const hasFieldsBelow = scrollWindow.end < schemaFields.length;
  function renderFormFields() {
    if (!schemaFields.length) return null;
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      hasFieldsAbove && /* @__PURE__ */ jsx(Box, { marginLeft: 2, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        figures.arrowUp,
        " ",
        scrollWindow.start,
        " more above"
      ] }) }),
      schemaFields.slice(scrollWindow.start, scrollWindow.end).map((field_0, visibleIdx) => {
        const index_0 = scrollWindow.start + visibleIdx;
        const {
          name: name_1,
          schema: schema_6,
          isRequired
        } = field_0;
        const isActive = index_0 === currentFieldIndex && !focusedButton;
        const value_3 = formValues[name_1];
        const hasValue = value_3 !== void 0 && (!Array.isArray(value_3) || value_3.length > 0);
        const error_0 = validationErrors[name_1];
        const isResolving = resolvingFields.has(name_1);
        const checkbox = isResolving ? /* @__PURE__ */ jsx(ResolvingSpinner, {}) : error_0 ? /* @__PURE__ */ jsx(Text, { color: "error", children: figures.warning }) : hasValue ? /* @__PURE__ */ jsx(Text, { color: "success", dimColor: !isActive, children: figures.tick }) : isRequired ? /* @__PURE__ */ jsx(Text, { color: "error", children: "*" }) : /* @__PURE__ */ jsx(Text, { children: " " });
        const selectionColor = error_0 ? "error" : hasValue ? "success" : isRequired ? "error" : "suggestion";
        const activeColor = isActive ? selectionColor : void 0;
        const label = /* @__PURE__ */ jsx(Text, { color: activeColor, bold: isActive, children: schema_6.title || name_1 });
        let valueContent;
        let accordionContent = null;
        if (isMultiSelectEnumSchema(schema_6)) {
          const msValues_0 = getMultiSelectValues(schema_6);
          const selected_1 = value_3 ?? [];
          const isExpanded = expandedAccordion === name_1 && isActive;
          if (isExpanded) {
            valueContent = /* @__PURE__ */ jsx(Text, { dimColor: true, children: figures.triangleDownSmall });
            accordionContent = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginLeft: 6, children: msValues_0.map((optVal, optIdx) => {
              const optLabel = getMultiSelectLabel(schema_6, optVal);
              const isChecked = selected_1.includes(optVal);
              const isFocused = optIdx === accordionOptionIndex;
              return /* @__PURE__ */ jsxs(Box, { gap: 1, children: [
                /* @__PURE__ */ jsx(Text, { color: "suggestion", children: isFocused ? figures.pointer : " " }),
                /* @__PURE__ */ jsx(Text, { color: isChecked ? "success" : void 0, children: isChecked ? figures.checkboxOn : figures.checkboxOff }),
                /* @__PURE__ */ jsx(Text, { color: isFocused ? "suggestion" : void 0, bold: isFocused, children: optLabel })
              ] }, optVal);
            }) });
          } else {
            const arrow = isActive ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
              figures.triangleRightSmall,
              " "
            ] }) : null;
            if (selected_1.length > 0) {
              const displayLabels = selected_1.map((v_4) => getMultiSelectLabel(schema_6, v_4));
              valueContent = /* @__PURE__ */ jsxs(Text, { children: [
                arrow,
                /* @__PURE__ */ jsx(Text, { color: activeColor, bold: isActive, children: displayLabels.join(", ") })
              ] });
            } else {
              valueContent = /* @__PURE__ */ jsxs(Text, { children: [
                arrow,
                /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: "not set" })
              ] });
            }
          }
        } else if (isEnumSchema(schema_6)) {
          const enumValues_0 = getEnumValues(schema_6);
          const isExpanded_0 = expandedAccordion === name_1 && isActive;
          if (isExpanded_0) {
            valueContent = /* @__PURE__ */ jsx(Text, { dimColor: true, children: figures.triangleDownSmall });
            accordionContent = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginLeft: 6, children: enumValues_0.map((optVal_0, optIdx_0) => {
              const optLabel_0 = getEnumLabel(schema_6, optVal_0);
              const isSelected = value_3 === optVal_0;
              const isFocused_0 = optIdx_0 === accordionOptionIndex;
              return /* @__PURE__ */ jsxs(Box, { gap: 1, children: [
                /* @__PURE__ */ jsx(Text, { color: "suggestion", children: isFocused_0 ? figures.pointer : " " }),
                /* @__PURE__ */ jsx(Text, { color: isSelected ? "success" : void 0, children: isSelected ? figures.radioOn : figures.radioOff }),
                /* @__PURE__ */ jsx(Text, { color: isFocused_0 ? "suggestion" : void 0, bold: isFocused_0, children: optLabel_0 })
              ] }, optVal_0);
            }) });
          } else {
            const arrow_0 = isActive ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
              figures.triangleRightSmall,
              " "
            ] }) : null;
            if (hasValue) {
              valueContent = /* @__PURE__ */ jsxs(Text, { children: [
                arrow_0,
                /* @__PURE__ */ jsx(Text, { color: activeColor, bold: isActive, children: getEnumLabel(schema_6, value_3) })
              ] });
            } else {
              valueContent = /* @__PURE__ */ jsxs(Text, { children: [
                arrow_0,
                /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: "not set" })
              ] });
            }
          }
        } else if (schema_6.type === "boolean") {
          if (isActive) {
            valueContent = hasValue ? /* @__PURE__ */ jsx(Text, { color: activeColor, bold: true, children: value_3 ? figures.checkboxOn : figures.checkboxOff }) : /* @__PURE__ */ jsx(Text, { dimColor: true, children: figures.checkboxOff });
          } else {
            valueContent = hasValue ? /* @__PURE__ */ jsx(Text, { children: value_3 ? figures.checkboxOn : figures.checkboxOff }) : /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: "not set" });
          }
        } else if (isTextField(schema_6)) {
          if (isActive) {
            valueContent = /* @__PURE__ */ jsx(TextInput, { value: textInputValue, onChange: handleTextInputChange, onSubmit: handleTextInputSubmit, placeholder: `Type something\u2026`, columns: Math.min(columns - 20, 60), cursorOffset: textInputCursorOffset, onChangeCursorOffset: setTextInputCursorOffset, focus: true, showCursor: true });
          } else {
            const displayValue = hasValue && isDateTimeSchema(schema_6) ? formatDateDisplay(String(value_3), schema_6) : String(value_3);
            valueContent = hasValue ? /* @__PURE__ */ jsx(Text, { children: displayValue }) : /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: "not set" });
          }
        } else {
          valueContent = hasValue ? /* @__PURE__ */ jsx(Text, { children: String(value_3) }) : /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: "not set" });
        }
        return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
          /* @__PURE__ */ jsxs(Box, { gap: 1, children: [
            /* @__PURE__ */ jsx(Text, { color: selectionColor, children: isActive ? figures.pointer : " " }),
            checkbox,
            /* @__PURE__ */ jsxs(Box, { children: [
              label,
              /* @__PURE__ */ jsx(Text, { color: activeColor, children: ": " }),
              valueContent
            ] })
          ] }),
          accordionContent,
          schema_6.description && /* @__PURE__ */ jsx(Box, { marginLeft: 6, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: schema_6.description }) }),
          /* @__PURE__ */ jsx(Box, { marginLeft: 6, height: 1, children: error_0 ? /* @__PURE__ */ jsx(Text, { color: "error", italic: true, children: error_0 }) : /* @__PURE__ */ jsx(Text, { children: " " }) })
        ] }, name_1);
      }),
      hasFieldsBelow && /* @__PURE__ */ jsx(Box, { marginLeft: 2, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        figures.arrowDown,
        " ",
        schemaFields.length - scrollWindow.end,
        " more below"
      ] }) })
    ] });
  }
  return /* @__PURE__ */ jsx(Dialog, { title: `MCP server \u201C${serverName}\u201D requests your input`, subtitle: `
${message}`, color: "permission", onCancel: () => onResponse("cancel"), isCancelActive: (!currentField || !!focusedButton) && !expandedAccordion, inputGuide: (exitState) => exitState.pending ? /* @__PURE__ */ jsxs(Text, { children: [
    "Press ",
    exitState.keyName,
    " again to exit"
  ] }) : /* @__PURE__ */ jsxs(Byline, { children: [
    /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" }),
    /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2191\u2193", action: "navigate" }),
    currentField && /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Backspace", action: "unset" }),
    currentField && currentField.schema.type === "boolean" && /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Space", action: "toggle" }),
    currentField && isEnumSchema(currentField.schema) && (expandedAccordion ? /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Space", action: "select" }) : /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2192", action: "expand" })),
    currentField && isMultiSelectEnumSchema(currentField.schema) && (expandedAccordion ? /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Space", action: "toggle" }) : /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2192", action: "expand" }))
  ] }), children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    renderFormFields(),
    /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Text, { color: "success", children: focusedButton === "accept" ? figures.pointer : " " }),
      /* @__PURE__ */ jsx(Text, { bold: focusedButton === "accept", color: focusedButton === "accept" ? "success" : void 0, dimColor: focusedButton !== "accept", children: " Accept  " }),
      /* @__PURE__ */ jsx(Text, { color: "error", children: focusedButton === "decline" ? figures.pointer : " " }),
      /* @__PURE__ */ jsx(Text, { bold: focusedButton === "decline", color: focusedButton === "decline" ? "error" : void 0, dimColor: focusedButton !== "decline", children: " Decline" })
    ] })
  ] }) });
}
function ElicitationURLDialog({
  event,
  onResponse,
  onWaitingDismiss
}) {
  const {
    serverName,
    signal,
    waitingState
  } = event;
  const urlParams = event.params;
  const {
    message,
    url
  } = urlParams;
  const [phase, setPhase] = useState("prompt");
  const phaseRef = useRef("prompt");
  const [focusedButton, setFocusedButton] = useState("accept");
  const showCancel = waitingState?.showCancel ?? false;
  useNotifyAfterTimeout("Claude Code needs your input", "elicitation_url_dialog");
  useRegisterOverlay("elicitation-url");
  phaseRef.current = phase;
  const onWaitingDismissRef = useRef(onWaitingDismiss);
  onWaitingDismissRef.current = onWaitingDismiss;
  useEffect(() => {
    const handleAbort = () => {
      if (phaseRef.current === "waiting") {
        onWaitingDismissRef.current?.("cancel");
      } else {
        onResponse("cancel");
      }
    };
    if (signal.aborted) {
      handleAbort();
      return;
    }
    signal.addEventListener("abort", handleAbort);
    return () => signal.removeEventListener("abort", handleAbort);
  }, [signal, onResponse]);
  let domain = "";
  let urlBeforeDomain = "";
  let urlAfterDomain = "";
  try {
    const parsed = new URL(url);
    domain = parsed.hostname;
    const domainStart = url.indexOf(domain);
    urlBeforeDomain = url.slice(0, domainStart);
    urlAfterDomain = url.slice(domainStart + domain.length);
  } catch {
    domain = url;
  }
  useEffect(() => {
    if (phase === "waiting" && event.completed) {
      onWaitingDismiss?.(showCancel ? "retry" : "dismiss");
    }
  }, [phase, event.completed, onWaitingDismiss, showCancel]);
  const handleAccept = useCallback(() => {
    void openBrowser(url);
    onResponse("accept");
    setPhase("waiting");
    phaseRef.current = "waiting";
    setFocusedButton("open");
  }, [onResponse, url]);
  useInput((_input, key) => {
    if (phase === "prompt") {
      if (key.leftArrow || key.rightArrow) {
        setFocusedButton((prev) => prev === "accept" ? "decline" : "accept");
        return;
      }
      if (key.return) {
        if (focusedButton === "accept") {
          handleAccept();
        } else {
          onResponse("decline");
        }
      }
    } else {
      const waitingButtons = showCancel ? ["open", "action", "cancel"] : ["open", "action"];
      if (key.leftArrow || key.rightArrow) {
        setFocusedButton((prev_0) => {
          const idx = waitingButtons.indexOf(prev_0);
          const delta = key.rightArrow ? 1 : -1;
          return waitingButtons[(idx + delta + waitingButtons.length) % waitingButtons.length];
        });
        return;
      }
      if (key.return) {
        if (focusedButton === "open") {
          void openBrowser(url);
        } else if (focusedButton === "cancel") {
          onWaitingDismiss?.("cancel");
        } else {
          onWaitingDismiss?.(showCancel ? "retry" : "dismiss");
        }
      }
    }
  });
  if (phase === "waiting") {
    const actionLabel = waitingState?.actionLabel ?? "Continue without waiting";
    return /* @__PURE__ */ jsx(Dialog, { title: `MCP server \u201C${serverName}\u201D \u2014 waiting for completion`, subtitle: `
${message}`, color: "permission", onCancel: () => onWaitingDismiss?.("cancel"), isCancelActive: true, inputGuide: (exitState) => exitState.pending ? /* @__PURE__ */ jsxs(Text, { children: [
      "Press ",
      exitState.keyName,
      " again to exit"
    ] }) : /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" }),
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\\u2190\\u2192", action: "switch" })
    ] }), children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Box, { marginBottom: 1, flexDirection: "column", children: /* @__PURE__ */ jsxs(Text, { children: [
        urlBeforeDomain,
        /* @__PURE__ */ jsx(Text, { bold: true, children: domain }),
        urlAfterDomain
      ] }) }),
      /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: "Waiting for the server to confirm completion\u2026" }) }),
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { color: "success", children: focusedButton === "open" ? figures.pointer : " " }),
        /* @__PURE__ */ jsx(Text, { bold: focusedButton === "open", color: focusedButton === "open" ? "success" : void 0, dimColor: focusedButton !== "open", children: " Reopen URL  " }),
        /* @__PURE__ */ jsx(Text, { color: "success", children: focusedButton === "action" ? figures.pointer : " " }),
        /* @__PURE__ */ jsx(Text, { bold: focusedButton === "action", color: focusedButton === "action" ? "success" : void 0, dimColor: focusedButton !== "action", children: ` ${actionLabel}` }),
        showCancel && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { children: " " }),
          /* @__PURE__ */ jsx(Text, { color: "error", children: focusedButton === "cancel" ? figures.pointer : " " }),
          /* @__PURE__ */ jsx(Text, { bold: focusedButton === "cancel", color: focusedButton === "cancel" ? "error" : void 0, dimColor: focusedButton !== "cancel", children: " Cancel" })
        ] })
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsx(Dialog, { title: `MCP server \u201C${serverName}\u201D wants to open a URL`, subtitle: `
${message}`, color: "permission", onCancel: () => onResponse("cancel"), isCancelActive: true, inputGuide: (exitState_0) => exitState_0.pending ? /* @__PURE__ */ jsxs(Text, { children: [
    "Press ",
    exitState_0.keyName,
    " again to exit"
  ] }) : /* @__PURE__ */ jsxs(Byline, { children: [
    /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" }),
    /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\\u2190\\u2192", action: "switch" })
  ] }), children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx(Box, { marginBottom: 1, flexDirection: "column", children: /* @__PURE__ */ jsxs(Text, { children: [
      urlBeforeDomain,
      /* @__PURE__ */ jsx(Text, { bold: true, children: domain }),
      urlAfterDomain
    ] }) }),
    /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Text, { color: "success", children: focusedButton === "accept" ? figures.pointer : " " }),
      /* @__PURE__ */ jsx(Text, { bold: focusedButton === "accept", color: focusedButton === "accept" ? "success" : void 0, dimColor: focusedButton !== "accept", children: " Accept  " }),
      /* @__PURE__ */ jsx(Text, { color: "error", children: focusedButton === "decline" ? figures.pointer : " " }),
      /* @__PURE__ */ jsx(Text, { bold: focusedButton === "decline", color: focusedButton === "decline" ? "error" : void 0, dimColor: focusedButton !== "decline", children: " Decline" })
    ] })
  ] }) });
}
export {
  ElicitationDialog
};
