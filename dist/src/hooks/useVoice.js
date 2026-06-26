import { useCallback, useEffect, useRef, useState } from "react";
import { useSetVoiceState } from "../context/voice.js";
import { useTerminalFocus } from "../ink/hooks/use-terminal-focus.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { getVoiceKeyterms } from "../services/voiceKeyterms.js";
import {
  connectVoiceStream,
  isVoiceStreamAvailable
} from "../services/voiceStreamSTT.js";
import { logForDebugging } from "../utils/debug.js";
import { toError } from "../utils/errors.js";
import { getSystemLocaleLanguage } from "../utils/intl.js";
import { logError } from "../utils/log.js";
import { getInitialSettings } from "../utils/settings/settings.js";
import { sleep } from "../utils/sleep.js";
const DEFAULT_STT_LANGUAGE = "en";
const LANGUAGE_NAME_TO_CODE = {
  english: "en",
  spanish: "es",
  espa\u00F1ol: "es",
  espanol: "es",
  french: "fr",
  fran\u00E7ais: "fr",
  francais: "fr",
  japanese: "ja",
  \u65E5\u672C\u8A9E: "ja",
  german: "de",
  deutsch: "de",
  portuguese: "pt",
  portugu\u00EAs: "pt",
  portugues: "pt",
  italian: "it",
  italiano: "it",
  korean: "ko",
  \uD55C\uAD6D\uC5B4: "ko",
  hindi: "hi",
  \u0939\u093F\u0928\u094D\u0926\u0940: "hi",
  \u0939\u093F\u0902\u0926\u0940: "hi",
  indonesian: "id",
  "bahasa indonesia": "id",
  bahasa: "id",
  russian: "ru",
  \u0440\u0443\u0441\u0441\u043A\u0438\u0439: "ru",
  polish: "pl",
  polski: "pl",
  turkish: "tr",
  t\u00FCrk\u00E7e: "tr",
  turkce: "tr",
  dutch: "nl",
  nederlands: "nl",
  ukrainian: "uk",
  \u0443\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430: "uk",
  greek: "el",
  \u03B5\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC: "el",
  czech: "cs",
  \u010De\u0161tina: "cs",
  cestina: "cs",
  danish: "da",
  dansk: "da",
  swedish: "sv",
  svenska: "sv",
  norwegian: "no",
  norsk: "no"
};
const SUPPORTED_LANGUAGE_CODES = /* @__PURE__ */ new Set([
  "en",
  "es",
  "fr",
  "ja",
  "de",
  "pt",
  "it",
  "ko",
  "hi",
  "id",
  "ru",
  "pl",
  "tr",
  "nl",
  "uk",
  "el",
  "cs",
  "da",
  "sv",
  "no"
]);
function normalizeLanguageForSTT(language) {
  if (!language) return { code: DEFAULT_STT_LANGUAGE };
  const lower = language.toLowerCase().trim();
  if (!lower) return { code: DEFAULT_STT_LANGUAGE };
  if (SUPPORTED_LANGUAGE_CODES.has(lower)) return { code: lower };
  const fromName = LANGUAGE_NAME_TO_CODE[lower];
  if (fromName) return { code: fromName };
  const base = lower.split("-")[0];
  if (base && SUPPORTED_LANGUAGE_CODES.has(base)) return { code: base };
  return { code: DEFAULT_STT_LANGUAGE, fellBackFrom: language };
}
let voiceModule = null;
const RELEASE_TIMEOUT_MS = 200;
const REPEAT_FALLBACK_MS = 600;
const FIRST_PRESS_FALLBACK_MS = 2e3;
const FOCUS_SILENCE_TIMEOUT_MS = 5e3;
const AUDIO_LEVEL_BARS = 16;
function computeLevel(chunk) {
  const samples = chunk.length >> 1;
  if (samples === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < chunk.length - 1; i += 2) {
    const sample = (chunk[i] | chunk[i + 1] << 8) << 16 >> 16;
    sumSq += sample * sample;
  }
  const rms = Math.sqrt(sumSq / samples);
  const normalized = Math.min(rms / 2e3, 1);
  return Math.sqrt(normalized);
}
function useVoice({
  onTranscript,
  onError,
  enabled,
  focusMode
}) {
  const [state, setState] = useState("idle");
  const stateRef = useRef("idle");
  const connectionRef = useRef(null);
  const accumulatedRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const cleanupTimerRef = useRef(null);
  const releaseTimerRef = useRef(null);
  const seenRepeatRef = useRef(false);
  const repeatFallbackTimerRef = useRef(
    null
  );
  const focusTriggeredRef = useRef(false);
  const focusSilenceTimerRef = useRef(
    null
  );
  const silenceTimedOutRef = useRef(false);
  const recordingStartRef = useRef(0);
  const sessionGenRef = useRef(0);
  const retryUsedRef = useRef(false);
  const fullAudioRef = useRef([]);
  const silentDropRetriedRef = useRef(false);
  const attemptGenRef = useRef(0);
  const focusFlushedCharsRef = useRef(0);
  const hasAudioSignalRef = useRef(false);
  const everConnectedRef = useRef(false);
  const audioLevelsRef = useRef([]);
  const isFocused = useTerminalFocus();
  const setVoiceState = useSetVoiceState();
  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;
  function updateState(newState) {
    stateRef.current = newState;
    setState(newState);
    setVoiceState((prev) => {
      if (prev.voiceState === newState) return prev;
      return { ...prev, voiceState: newState };
    });
  }
  const cleanup = useCallback(() => {
    sessionGenRef.current++;
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    if (repeatFallbackTimerRef.current) {
      clearTimeout(repeatFallbackTimerRef.current);
      repeatFallbackTimerRef.current = null;
    }
    if (focusSilenceTimerRef.current) {
      clearTimeout(focusSilenceTimerRef.current);
      focusSilenceTimerRef.current = null;
    }
    silenceTimedOutRef.current = false;
    voiceModule?.stopRecording();
    if (connectionRef.current) {
      connectionRef.current.close();
      connectionRef.current = null;
    }
    accumulatedRef.current = "";
    audioLevelsRef.current = [];
    fullAudioRef.current = [];
    setVoiceState((prev) => {
      if (prev.voiceInterimTranscript === "" && !prev.voiceAudioLevels.length)
        return prev;
      return { ...prev, voiceInterimTranscript: "", voiceAudioLevels: [] };
    });
  }, [setVoiceState]);
  function finishRecording() {
    logForDebugging(
      "[voice] finishRecording: stopping recording, transitioning to processing"
    );
    attemptGenRef.current++;
    const focusTriggered = focusTriggeredRef.current;
    focusTriggeredRef.current = false;
    updateState("processing");
    voiceModule?.stopRecording();
    const recordingDurationMs = Date.now() - recordingStartRef.current;
    const hadAudioSignal = hasAudioSignalRef.current;
    const retried = retryUsedRef.current;
    const focusFlushedChars = focusFlushedCharsRef.current;
    const wsConnected = everConnectedRef.current;
    const myGen = sessionGenRef.current;
    const isStale = () => sessionGenRef.current !== myGen;
    logForDebugging("[voice] Recording stopped");
    const finalizePromise = connectionRef.current ? connectionRef.current.finalize() : Promise.resolve(void 0);
    void finalizePromise.then(async (finalizeSource) => {
      if (isStale()) return;
      if (finalizeSource === "no_data_timeout" && hadAudioSignal && wsConnected && !focusTriggered && focusFlushedChars === 0 && accumulatedRef.current.trim() === "" && !silentDropRetriedRef.current && fullAudioRef.current.length > 0) {
        silentDropRetriedRef.current = true;
        logForDebugging(
          `[voice] Silent-drop detected (no_data_timeout, ${String(fullAudioRef.current.length)} chunks); replaying on fresh connection`
        );
        logEvent("tengu_voice_silent_drop_replay", {
          recordingDurationMs,
          chunkCount: fullAudioRef.current.length
        });
        if (connectionRef.current) {
          connectionRef.current.close();
          connectionRef.current = null;
        }
        const replayBuffer = fullAudioRef.current;
        await sleep(250);
        if (isStale()) return;
        const stt = normalizeLanguageForSTT(getInitialSettings().language);
        const keyterms = await getVoiceKeyterms();
        if (isStale()) return;
        await new Promise((resolve) => {
          void connectVoiceStream(
            {
              onTranscript: (t, isFinal) => {
                if (isStale()) return;
                if (isFinal && t.trim()) {
                  if (accumulatedRef.current) accumulatedRef.current += " ";
                  accumulatedRef.current += t.trim();
                }
              },
              onError: () => resolve(),
              onClose: () => {
              },
              onReady: (conn) => {
                if (isStale()) {
                  conn.close();
                  resolve();
                  return;
                }
                connectionRef.current = conn;
                const SLICE = 32e3;
                let slice = [];
                let bytes = 0;
                for (const c of replayBuffer) {
                  if (bytes > 0 && bytes + c.length > SLICE) {
                    conn.send(Buffer.concat(slice));
                    slice = [];
                    bytes = 0;
                  }
                  slice.push(c);
                  bytes += c.length;
                }
                if (slice.length) conn.send(Buffer.concat(slice));
                void conn.finalize().then(() => {
                  conn.close();
                  resolve();
                });
              }
            },
            { language: stt.code, keyterms }
          ).then(
            (c) => {
              if (!c) resolve();
            },
            () => resolve()
          );
        });
        if (isStale()) return;
      }
      fullAudioRef.current = [];
      const text = accumulatedRef.current.trim();
      logForDebugging(
        `[voice] Final transcript assembled (${String(text.length)} chars): "${text.slice(0, 200)}"`
      );
      logEvent("tengu_voice_recording_completed", {
        transcriptChars: text.length + focusFlushedChars,
        recordingDurationMs,
        hadAudioSignal,
        retried,
        silentDropRetried: silentDropRetriedRef.current,
        wsConnected,
        focusTriggered
      });
      if (connectionRef.current) {
        connectionRef.current.close();
        connectionRef.current = null;
      }
      if (text) {
        logForDebugging(
          `[voice] Injecting transcript (${String(text.length)} chars)`
        );
        onTranscriptRef.current(text);
      } else if (focusFlushedChars === 0 && recordingDurationMs > 2e3) {
        if (!wsConnected) {
          onErrorRef.current?.(
            "Voice connection failed. Check your network and try again."
          );
        } else if (!hadAudioSignal) {
          onErrorRef.current?.(
            "No audio detected from microphone. Check that the correct input device is selected and that Claude Code has microphone access."
          );
        } else {
          onErrorRef.current?.("No speech detected.");
        }
      }
      accumulatedRef.current = "";
      setVoiceState((prev) => {
        if (prev.voiceInterimTranscript === "") return prev;
        return { ...prev, voiceInterimTranscript: "" };
      });
      updateState("idle");
    }).catch((err) => {
      logError(toError(err));
      if (!isStale()) updateState("idle");
    });
  }
  useEffect(() => {
    if (enabled && !voiceModule) {
      void import("../services/voice.js").then((mod) => {
        voiceModule = mod;
      });
    }
  }, [enabled]);
  function armFocusSilenceTimer() {
    if (focusSilenceTimerRef.current) {
      clearTimeout(focusSilenceTimerRef.current);
    }
    focusSilenceTimerRef.current = setTimeout(
      (focusSilenceTimerRef2, stateRef2, focusTriggeredRef2, silenceTimedOutRef2, finishRecording2) => {
        focusSilenceTimerRef2.current = null;
        if (stateRef2.current === "recording" && focusTriggeredRef2.current) {
          logForDebugging(
            "[voice] Focus silence timeout \u2014 tearing down session"
          );
          silenceTimedOutRef2.current = true;
          finishRecording2();
        }
      },
      FOCUS_SILENCE_TIMEOUT_MS,
      focusSilenceTimerRef,
      stateRef,
      focusTriggeredRef,
      silenceTimedOutRef,
      finishRecording
    );
  }
  useEffect(() => {
    if (!enabled || !focusMode) {
      if (focusTriggeredRef.current && stateRef.current === "recording") {
        logForDebugging(
          "[voice] Focus mode disabled during recording, finishing"
        );
        finishRecording();
      }
      return;
    }
    let cancelled = false;
    if (isFocused && stateRef.current === "idle" && !silenceTimedOutRef.current) {
      const beginFocusRecording = () => {
        if (cancelled || stateRef.current !== "idle" || silenceTimedOutRef.current)
          return;
        logForDebugging("[voice] Focus gained, starting recording session");
        focusTriggeredRef.current = true;
        void startRecordingSession();
        armFocusSilenceTimer();
      };
      if (voiceModule) {
        beginFocusRecording();
      } else {
        void import("../services/voice.js").then((mod) => {
          voiceModule = mod;
          beginFocusRecording();
        });
      }
    } else if (!isFocused) {
      silenceTimedOutRef.current = false;
      if (stateRef.current === "recording") {
        logForDebugging("[voice] Focus lost, finishing recording");
        finishRecording();
      }
    }
    return () => {
      cancelled = true;
    };
  }, [enabled, focusMode, isFocused]);
  async function startRecordingSession() {
    if (!voiceModule) {
      onErrorRef.current?.(
        "Voice module not loaded yet. Try again in a moment."
      );
      return;
    }
    updateState("recording");
    recordingStartRef.current = Date.now();
    accumulatedRef.current = "";
    seenRepeatRef.current = false;
    hasAudioSignalRef.current = false;
    retryUsedRef.current = false;
    silentDropRetriedRef.current = false;
    fullAudioRef.current = [];
    focusFlushedCharsRef.current = 0;
    everConnectedRef.current = false;
    const myGen = ++sessionGenRef.current;
    const availability = await voiceModule.checkRecordingAvailability();
    if (!availability.available) {
      logForDebugging(
        `[voice] Recording not available: ${availability.reason ?? "unknown"}`
      );
      onErrorRef.current?.(
        availability.reason ?? "Audio recording is not available."
      );
      cleanup();
      updateState("idle");
      return;
    }
    logForDebugging(
      "[voice] Starting recording session, connecting voice stream"
    );
    setVoiceState((prev) => {
      if (!prev.voiceError) return prev;
      return { ...prev, voiceError: null };
    });
    const audioBuffer = [];
    logForDebugging(
      "[voice] startRecording: buffering audio while WebSocket connects"
    );
    audioLevelsRef.current = [];
    const started = await voiceModule.startRecording(
      (chunk) => {
        const owned = Buffer.from(chunk);
        if (!focusTriggeredRef.current) {
          fullAudioRef.current.push(owned);
        }
        if (connectionRef.current) {
          connectionRef.current.send(owned);
        } else {
          audioBuffer.push(owned);
        }
        const level = computeLevel(chunk);
        if (!hasAudioSignalRef.current && level > 0.01) {
          hasAudioSignalRef.current = true;
        }
        const levels = audioLevelsRef.current;
        if (levels.length >= AUDIO_LEVEL_BARS) {
          levels.shift();
        }
        levels.push(level);
        const snapshot = [...levels];
        audioLevelsRef.current = snapshot;
        setVoiceState((prev) => ({ ...prev, voiceAudioLevels: snapshot }));
      },
      () => {
        if (stateRef.current === "recording") {
          finishRecording();
        }
      },
      { silenceDetection: false }
    );
    if (!started) {
      logError(new Error("[voice] Recording failed \u2014 no audio tool found"));
      onErrorRef.current?.(
        "Failed to start audio capture. Check that your microphone is accessible."
      );
      cleanup();
      updateState("idle");
      setVoiceState((prev) => ({
        ...prev,
        voiceError: "Recording failed \u2014 no audio tool found"
      }));
      return;
    }
    const rawLanguage = getInitialSettings().language;
    const stt = normalizeLanguageForSTT(rawLanguage);
    logEvent("tengu_voice_recording_started", {
      focusTriggered: focusTriggeredRef.current,
      sttLanguage: stt.code,
      sttLanguageIsDefault: !rawLanguage?.trim(),
      sttLanguageFellBack: stt.fellBackFrom !== void 0,
      // ISO 639 subtag from Intl (bounded set, never user text). undefined if
      // Intl failed — omitted from the payload, no retry cost (cached).
      systemLocaleLanguage: getSystemLocaleLanguage()
    });
    let sawTranscript = false;
    const isStale = () => sessionGenRef.current !== myGen;
    const attemptConnect = (keyterms) => {
      const myAttemptGen = attemptGenRef.current;
      void connectVoiceStream(
        {
          onTranscript: (text, isFinal) => {
            if (isStale()) return;
            sawTranscript = true;
            logForDebugging(
              `[voice] onTranscript: isFinal=${String(isFinal)} text="${text}"`
            );
            if (isFinal && text.trim()) {
              if (focusTriggeredRef.current) {
                logForDebugging(
                  `[voice] Focus mode: flushing final transcript immediately: "${text.trim()}"`
                );
                onTranscriptRef.current(text.trim());
                focusFlushedCharsRef.current += text.trim().length;
                setVoiceState((prev) => {
                  if (prev.voiceInterimTranscript === "") return prev;
                  return { ...prev, voiceInterimTranscript: "" };
                });
                accumulatedRef.current = "";
                armFocusSilenceTimer();
              } else {
                if (accumulatedRef.current) {
                  accumulatedRef.current += " ";
                }
                accumulatedRef.current += text.trim();
                logForDebugging(
                  `[voice] Accumulated final transcript: "${accumulatedRef.current}"`
                );
                setVoiceState((prev) => {
                  const preview = accumulatedRef.current;
                  if (prev.voiceInterimTranscript === preview) return prev;
                  return { ...prev, voiceInterimTranscript: preview };
                });
              }
            } else if (!isFinal) {
              if (focusTriggeredRef.current) {
                armFocusSilenceTimer();
              }
              const interim = text.trim();
              const preview = accumulatedRef.current ? accumulatedRef.current + (interim ? " " + interim : "") : interim;
              setVoiceState((prev) => {
                if (prev.voiceInterimTranscript === preview) return prev;
                return { ...prev, voiceInterimTranscript: preview };
              });
            }
          },
          onError: (error, opts) => {
            if (isStale()) {
              logForDebugging(
                `[voice] ignoring onError from stale session: ${error}`
              );
              return;
            }
            if (attemptGenRef.current !== myAttemptGen) {
              logForDebugging(
                `[voice] ignoring stale onError from superseded attempt: ${error}`
              );
              return;
            }
            if (!opts?.fatal && !sawTranscript && stateRef.current === "recording") {
              if (!retryUsedRef.current) {
                retryUsedRef.current = true;
                logForDebugging(
                  `[voice] early voice_stream error (pre-transcript), retrying once: ${error}`
                );
                logEvent("tengu_voice_stream_early_retry", {});
                connectionRef.current = null;
                attemptGenRef.current++;
                setTimeout(
                  (stateRef2, attemptConnect2, keyterms2) => {
                    if (stateRef2.current === "recording") {
                      attemptConnect2(keyterms2);
                    }
                  },
                  250,
                  stateRef,
                  attemptConnect,
                  keyterms
                );
                return;
              }
            }
            attemptGenRef.current++;
            logError(new Error(`[voice] voice_stream error: ${error}`));
            onErrorRef.current?.(`Voice stream error: ${error}`);
            audioBuffer.length = 0;
            focusTriggeredRef.current = false;
            cleanup();
            updateState("idle");
          },
          onClose: () => {
          },
          onReady: (conn) => {
            if (isStale() || stateRef.current !== "recording") {
              conn.close();
              return;
            }
            connectionRef.current = conn;
            everConnectedRef.current = true;
            const SLICE_TARGET_BYTES = 32e3;
            if (audioBuffer.length > 0) {
              let totalBytes = 0;
              for (const c of audioBuffer) totalBytes += c.length;
              const slices = [[]];
              let sliceBytes = 0;
              for (const chunk of audioBuffer) {
                if (sliceBytes > 0 && sliceBytes + chunk.length > SLICE_TARGET_BYTES) {
                  slices.push([]);
                  sliceBytes = 0;
                }
                slices[slices.length - 1].push(chunk);
                sliceBytes += chunk.length;
              }
              logForDebugging(
                `[voice] onReady: flushing ${String(audioBuffer.length)} buffered chunks (${String(totalBytes)} bytes) as ${String(slices.length)} coalesced frame(s)`
              );
              for (const slice of slices) {
                conn.send(Buffer.concat(slice));
              }
            }
            audioBuffer.length = 0;
            if (releaseTimerRef.current) {
              clearTimeout(releaseTimerRef.current);
            }
            if (seenRepeatRef.current) {
              releaseTimerRef.current = setTimeout(
                (releaseTimerRef2, stateRef2, finishRecording2) => {
                  releaseTimerRef2.current = null;
                  if (stateRef2.current === "recording") {
                    finishRecording2();
                  }
                },
                RELEASE_TIMEOUT_MS,
                releaseTimerRef,
                stateRef,
                finishRecording
              );
            }
          }
        },
        {
          language: stt.code,
          keyterms
        }
      ).then((conn) => {
        if (isStale()) {
          conn?.close();
          return;
        }
        if (!conn) {
          logForDebugging(
            "[voice] Failed to connect to voice_stream (no OAuth token?)"
          );
          onErrorRef.current?.(
            "Voice mode requires a Claude.ai account. Please run /login to sign in."
          );
          audioBuffer.length = 0;
          cleanup();
          updateState("idle");
          return;
        }
        if (stateRef.current !== "recording") {
          audioBuffer.length = 0;
          conn.close();
          return;
        }
      });
    };
    void getVoiceKeyterms().then(attemptConnect);
  }
  const handleKeyEvent = useCallback(
    (fallbackMs = REPEAT_FALLBACK_MS) => {
      if (!enabled || !isVoiceStreamAvailable()) {
        return;
      }
      if (focusTriggeredRef.current) {
        return;
      }
      if (focusMode && silenceTimedOutRef.current) {
        logForDebugging(
          "[voice] Re-arming focus recording after silence timeout"
        );
        silenceTimedOutRef.current = false;
        focusTriggeredRef.current = true;
        void startRecordingSession();
        armFocusSilenceTimer();
        return;
      }
      const currentState = stateRef.current;
      if (currentState === "processing") {
        return;
      }
      if (currentState === "idle") {
        logForDebugging(
          "[voice] handleKeyEvent: idle, starting recording session immediately"
        );
        void startRecordingSession();
        repeatFallbackTimerRef.current = setTimeout(
          (repeatFallbackTimerRef2, stateRef2, seenRepeatRef2, releaseTimerRef2, finishRecording2) => {
            repeatFallbackTimerRef2.current = null;
            if (stateRef2.current === "recording" && !seenRepeatRef2.current) {
              logForDebugging(
                "[voice] No auto-repeat seen, arming release timer via fallback"
              );
              seenRepeatRef2.current = true;
              releaseTimerRef2.current = setTimeout(
                (releaseTimerRef3, stateRef3, finishRecording3) => {
                  releaseTimerRef3.current = null;
                  if (stateRef3.current === "recording") {
                    finishRecording3();
                  }
                },
                RELEASE_TIMEOUT_MS,
                releaseTimerRef2,
                stateRef2,
                finishRecording2
              );
            }
          },
          fallbackMs,
          repeatFallbackTimerRef,
          stateRef,
          seenRepeatRef,
          releaseTimerRef,
          finishRecording
        );
      } else if (currentState === "recording") {
        seenRepeatRef.current = true;
        if (repeatFallbackTimerRef.current) {
          clearTimeout(repeatFallbackTimerRef.current);
          repeatFallbackTimerRef.current = null;
        }
      }
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
      }
      if (stateRef.current === "recording" && seenRepeatRef.current) {
        releaseTimerRef.current = setTimeout(
          (releaseTimerRef2, stateRef2, finishRecording2) => {
            releaseTimerRef2.current = null;
            if (stateRef2.current === "recording") {
              finishRecording2();
            }
          },
          RELEASE_TIMEOUT_MS,
          releaseTimerRef,
          stateRef,
          finishRecording
        );
      }
    },
    [enabled, focusMode, cleanup]
  );
  useEffect(() => {
    if (!enabled && stateRef.current !== "idle") {
      cleanup();
      updateState("idle");
    }
    return () => {
      cleanup();
    };
  }, [enabled, cleanup]);
  return {
    state,
    handleKeyEvent
  };
}
export {
  FIRST_PRESS_FALLBACK_MS,
  computeLevel,
  normalizeLanguageForSTT,
  useVoice
};
