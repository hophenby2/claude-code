import { useEffect, useState } from "react";
import { maybeTruncateInput } from "./inputPaste.js";
function useMaybeTruncateInput({
  input,
  pastedContents,
  onInputChange,
  setCursorOffset,
  setPastedContents
}) {
  const [hasAppliedTruncationToInput, setHasAppliedTruncationToInput] = useState(false);
  useEffect(() => {
    if (hasAppliedTruncationToInput) {
      return;
    }
    if (input.length <= 1e4) {
      return;
    }
    const { newInput, newPastedContents } = maybeTruncateInput(
      input,
      pastedContents
    );
    onInputChange(newInput);
    setCursorOffset(newInput.length);
    setPastedContents(newPastedContents);
    setHasAppliedTruncationToInput(true);
  }, [
    input,
    hasAppliedTruncationToInput,
    pastedContents,
    onInputChange,
    setPastedContents,
    setCursorOffset
  ]);
  useEffect(() => {
    if (input === "") {
      setHasAppliedTruncationToInput(false);
    }
  }, [input]);
}
export {
  useMaybeTruncateInput
};
