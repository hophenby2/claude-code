const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary"
];
const c = String.fromCharCode;
const duck = c(100, 117, 99, 107);
const goose = c(103, 111, 111, 115, 101);
const blob = c(98, 108, 111, 98);
const cat = c(99, 97, 116);
const dragon = c(100, 114, 97, 103, 111, 110);
const octopus = c(111, 99, 116, 111, 112, 117, 115);
const owl = c(111, 119, 108);
const penguin = c(112, 101, 110, 103, 117, 105, 110);
const turtle = c(116, 117, 114, 116, 108, 101);
const snail = c(115, 110, 97, 105, 108);
const ghost = c(103, 104, 111, 115, 116);
const axolotl = c(97, 120, 111, 108, 111, 116, 108);
const capybara = c(
  99,
  97,
  112,
  121,
  98,
  97,
  114,
  97
);
const cactus = c(99, 97, 99, 116, 117, 115);
const robot = c(114, 111, 98, 111, 116);
const rabbit = c(114, 97, 98, 98, 105, 116);
const mushroom = c(
  109,
  117,
  115,
  104,
  114,
  111,
  111,
  109
);
const chonk = c(99, 104, 111, 110, 107);
const SPECIES = [
  duck,
  goose,
  blob,
  cat,
  dragon,
  octopus,
  owl,
  penguin,
  turtle,
  snail,
  ghost,
  axolotl,
  capybara,
  cactus,
  robot,
  rabbit,
  mushroom,
  chonk
];
const EYES = ["\xB7", "\u2726", "\xD7", "\u25C9", "@", "\xB0"];
const HATS = [
  "none",
  "crown",
  "tophat",
  "propeller",
  "halo",
  "wizard",
  "beanie",
  "tinyduck"
];
const STAT_NAMES = [
  "DEBUGGING",
  "PATIENCE",
  "CHAOS",
  "WISDOM",
  "SNARK"
];
const RARITY_WEIGHTS = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1
};
const RARITY_STARS = {
  common: "\u2605",
  uncommon: "\u2605\u2605",
  rare: "\u2605\u2605\u2605",
  epic: "\u2605\u2605\u2605\u2605",
  legendary: "\u2605\u2605\u2605\u2605\u2605"
};
const RARITY_COLORS = {
  common: "inactive",
  uncommon: "success",
  rare: "permission",
  epic: "autoAccept",
  legendary: "warning"
};
export {
  EYES,
  HATS,
  RARITIES,
  RARITY_COLORS,
  RARITY_STARS,
  RARITY_WEIGHTS,
  SPECIES,
  STAT_NAMES,
  axolotl,
  blob,
  cactus,
  capybara,
  cat,
  chonk,
  dragon,
  duck,
  ghost,
  goose,
  mushroom,
  octopus,
  owl,
  penguin,
  rabbit,
  robot,
  snail,
  turtle
};
