import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { TEARDROP_ASTERISK } from "../../constants/figures.js";
import { useExitOnCtrlCDWithKeybindings } from "../../hooks/useExitOnCtrlCDWithKeybindings.js";
import { setClipboard } from "../../ink/termio/osc.js";
import { Box, Link, Text, useInput } from "../../ink.js";
import { useKeybinding } from "../../keybindings/useKeybinding.js";
import { logEvent } from "../../services/analytics/index.js";
import { fetchReferralRedemptions, formatCreditAmount, getCachedOrFetchPassesEligibility } from "../../services/api/referral.js";
import { count } from "../../utils/array.js";
import { logError } from "../../utils/log.js";
import { Pane } from "../design-system/Pane.js";
function Passes({
  onDone
}) {
  const [loading, setLoading] = useState(true);
  const [passStatuses, setPassStatuses] = useState([]);
  const [isAvailable, setIsAvailable] = useState(false);
  const [referralLink, setReferralLink] = useState(null);
  const [referrerReward, setReferrerReward] = useState(void 0);
  const exitState = useExitOnCtrlCDWithKeybindings(() => onDone("Guest passes dialog dismissed", {
    display: "system"
  }));
  const handleCancel = useCallback(() => {
    onDone("Guest passes dialog dismissed", {
      display: "system"
    });
  }, [onDone]);
  useKeybinding("confirm:no", handleCancel, {
    context: "Confirmation"
  });
  useInput((_input, key) => {
    if (key.return && referralLink) {
      void setClipboard(referralLink).then((raw) => {
        if (raw) process.stdout.write(raw);
        logEvent("tengu_guest_passes_link_copied", {});
        onDone(`Referral link copied to clipboard!`);
      });
    }
  });
  useEffect(() => {
    async function loadPassesData() {
      try {
        const eligibilityData = await getCachedOrFetchPassesEligibility();
        if (!eligibilityData || !eligibilityData.eligible) {
          setIsAvailable(false);
          setLoading(false);
          return;
        }
        setIsAvailable(true);
        if (eligibilityData.referral_code_details?.referral_link) {
          setReferralLink(eligibilityData.referral_code_details.referral_link);
        }
        setReferrerReward(eligibilityData.referrer_reward);
        const campaign = eligibilityData.referral_code_details?.campaign ?? "claude_code_guest_pass";
        let redemptionsData;
        try {
          redemptionsData = await fetchReferralRedemptions(campaign);
        } catch (err_0) {
          logError(err_0);
          setIsAvailable(false);
          setLoading(false);
          return;
        }
        const redemptions = redemptionsData.redemptions || [];
        const maxRedemptions = redemptionsData.limit || 3;
        const statuses = [];
        for (let i = 0; i < maxRedemptions; i++) {
          const redemption = redemptions[i];
          statuses.push({
            passNumber: i + 1,
            isAvailable: !redemption
          });
        }
        setPassStatuses(statuses);
        setLoading(false);
      } catch (err) {
        logError(err);
        setIsAvailable(false);
        setLoading(false);
      }
    }
    void loadPassesData();
  }, []);
  if (loading) {
    return /* @__PURE__ */ jsx(Pane, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Loading guest pass information\u2026" }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: exitState.pending ? /* @__PURE__ */ jsxs(Fragment, { children: [
        "Press ",
        exitState.keyName,
        " again to exit"
      ] }) : /* @__PURE__ */ jsx(Fragment, { children: "Esc to cancel" }) })
    ] }) });
  }
  if (!isAvailable) {
    return /* @__PURE__ */ jsx(Pane, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      /* @__PURE__ */ jsx(Text, { children: "Guest passes are not currently available." }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: exitState.pending ? /* @__PURE__ */ jsxs(Fragment, { children: [
        "Press ",
        exitState.keyName,
        " again to exit"
      ] }) : /* @__PURE__ */ jsx(Fragment, { children: "Esc to cancel" }) })
    ] }) });
  }
  const availableCount = count(passStatuses, (p) => p.isAvailable);
  const sortedPasses = [...passStatuses].sort((a, b) => +b.isAvailable - +a.isAvailable);
  const renderTicket = (pass) => {
    const isRedeemed = !pass.isAvailable;
    if (isRedeemed) {
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginRight: 1, children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2571" }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: ` ) CC ${TEARDROP_ASTERISK} \u250A\u2571` }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2571" })
      ] }, pass.passNumber);
    }
    return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginRight: 1, children: [
      /* @__PURE__ */ jsx(Text, { children: "\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510" }),
      /* @__PURE__ */ jsxs(Text, { children: [
        " ) CC ",
        /* @__PURE__ */ jsx(Text, { color: "claude", children: TEARDROP_ASTERISK }),
        " \u250A ( "
      ] }),
      /* @__PURE__ */ jsx(Text, { children: "\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518" })
    ] }, pass.passNumber);
  };
  return /* @__PURE__ */ jsx(Pane, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
    /* @__PURE__ */ jsxs(Text, { color: "permission", children: [
      "Guest passes \xB7 ",
      availableCount,
      " left"
    ] }),
    /* @__PURE__ */ jsx(Box, { flexDirection: "row", marginLeft: 2, children: sortedPasses.slice(0, 3).map((pass_0) => renderTicket(pass_0)) }),
    referralLink && /* @__PURE__ */ jsx(Box, { marginLeft: 2, children: /* @__PURE__ */ jsx(Text, { children: referralLink }) }),
    /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginLeft: 2, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      referrerReward ? `Share a free week of Claude Code with friends. If they love it and subscribe, you'll get ${formatCreditAmount(referrerReward)} of extra usage to keep building. ` : "Share a free week of Claude Code with friends. ",
      /* @__PURE__ */ jsx(Link, { url: referrerReward ? "https://support.claude.com/en/articles/13456702-claude-code-guest-passes" : "https://support.claude.com/en/articles/12875061-claude-code-guest-passes", children: "Terms apply." })
    ] }) }),
    /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: exitState.pending ? /* @__PURE__ */ jsxs(Fragment, { children: [
      "Press ",
      exitState.keyName,
      " again to exit"
    ] }) : /* @__PURE__ */ jsx(Fragment, { children: "Enter to copy link \xB7 Esc to cancel" }) }) })
  ] }) });
}
export {
  Passes
};
