const feature = (_name) => false;
import { getGlobalConfig } from "../utils/config.js";
import { getCompanion } from "./companion.js";
function companionIntroText(name, species) {
  return `# Companion

A small ${species} named ${name} sits beside the user's input box and occasionally comments in a speech bubble. You're not ${name} \u2014 it's a separate watcher.

When the user addresses ${name} directly (by name), its bubble will answer. Your job in that moment is to stay out of the way: respond in ONE line or less, or just answer any part of the message meant for you. Don't explain that you're not ${name} \u2014 they know. Don't narrate what ${name} might say \u2014 the bubble handles that.`;
}
function getCompanionIntroAttachment(messages) {
  if (true) return [];
  const companion = getCompanion();
  if (!companion || getGlobalConfig().companionMuted) return [];
  for (const msg of messages ?? []) {
    if (msg.type !== "attachment") continue;
    if (msg.attachment.type !== "companion_intro") continue;
    if (msg.attachment.name === companion.name) return [];
  }
  return [
    {
      type: "companion_intro",
      name: companion.name,
      species: companion.species
    }
  ];
}
export {
  companionIntroText,
  getCompanionIntroAttachment
};
