const URL_PROTOCOLS = ["http://", "https://", "ftp://"];
const DEPTH_RULES = {
  rg: 2,
  // pattern argument is required despite variadic paths
  "pre-commit": 2,
  // CLI tools with deep subcommand trees (e.g. gcloud scheduler jobs list)
  gcloud: 4,
  "gcloud compute": 6,
  "gcloud beta": 6,
  aws: 4,
  az: 4,
  kubectl: 3,
  docker: 3,
  dotnet: 3,
  "git push": 2
};
const toArray = (val) => Array.isArray(val) ? val : [val];
function isKnownSubcommand(arg, spec) {
  if (!spec?.subcommands?.length) return false;
  const argLower = arg.toLowerCase();
  return spec.subcommands.some(
    (sub) => Array.isArray(sub.name) ? sub.name.some((n) => n.toLowerCase() === argLower) : sub.name.toLowerCase() === argLower
  );
}
function flagTakesArg(flag, nextArg, spec) {
  if (spec?.options) {
    const option = spec.options.find(
      (opt) => Array.isArray(opt.name) ? opt.name.includes(flag) : opt.name === flag
    );
    if (option) return !!option.args;
  }
  if (spec?.subcommands?.length && nextArg && !nextArg.startsWith("-")) {
    return !isKnownSubcommand(nextArg, spec);
  }
  return false;
}
function findFirstSubcommand(args, spec) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (arg.startsWith("-")) {
      if (flagTakesArg(arg, args[i + 1], spec)) i++;
      continue;
    }
    if (!spec?.subcommands?.length) return arg;
    if (isKnownSubcommand(arg, spec)) return arg;
  }
  return void 0;
}
async function buildPrefix(command, args, spec) {
  const maxDepth = await calculateDepth(command, args, spec);
  const parts = [command];
  const hasSubcommands = !!spec?.subcommands?.length;
  let foundSubcommand = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg || parts.length >= maxDepth) break;
    if (arg.startsWith("-")) {
      if (arg === "-c" && ["python", "python3"].includes(command.toLowerCase()))
        break;
      if (spec?.options) {
        const option = spec.options.find(
          (opt) => Array.isArray(opt.name) ? opt.name.includes(arg) : opt.name === arg
        );
        if (option?.args && toArray(option.args).some((a) => a?.isCommand || a?.isModule)) {
          parts.push(arg);
          continue;
        }
      }
      if (hasSubcommands && !foundSubcommand) {
        if (flagTakesArg(arg, args[i + 1], spec)) i++;
        continue;
      }
      break;
    }
    if (await shouldStopAtArg(arg, args.slice(0, i), spec)) break;
    if (hasSubcommands && !foundSubcommand) {
      foundSubcommand = isKnownSubcommand(arg, spec);
    }
    parts.push(arg);
  }
  return parts.join(" ");
}
async function calculateDepth(command, args, spec) {
  const firstSubcommand = findFirstSubcommand(args, spec);
  const commandLower = command.toLowerCase();
  const key = firstSubcommand ? `${commandLower} ${firstSubcommand.toLowerCase()}` : commandLower;
  if (DEPTH_RULES[key]) return DEPTH_RULES[key];
  if (DEPTH_RULES[commandLower]) return DEPTH_RULES[commandLower];
  if (!spec) return 2;
  if (spec.options && args.some((arg) => arg?.startsWith("-"))) {
    for (const arg of args) {
      if (!arg?.startsWith("-")) continue;
      const option = spec.options.find(
        (opt) => Array.isArray(opt.name) ? opt.name.includes(arg) : opt.name === arg
      );
      if (option?.args && toArray(option.args).some((arg2) => arg2?.isCommand || arg2?.isModule))
        return 3;
    }
  }
  if (firstSubcommand && spec.subcommands?.length) {
    const firstSubLower = firstSubcommand.toLowerCase();
    const subcommand = spec.subcommands.find(
      (sub) => Array.isArray(sub.name) ? sub.name.some((n) => n.toLowerCase() === firstSubLower) : sub.name.toLowerCase() === firstSubLower
    );
    if (subcommand) {
      if (subcommand.args) {
        const subArgs = toArray(subcommand.args);
        if (subArgs.some((arg) => arg?.isCommand)) return 3;
        if (subArgs.some((arg) => arg?.isVariadic)) return 2;
      }
      if (subcommand.subcommands?.length) return 4;
      if (!subcommand.args) return 2;
      return 3;
    }
  }
  if (spec.args) {
    const argsArray = toArray(spec.args);
    if (argsArray.some((arg) => arg?.isCommand)) {
      return !Array.isArray(spec.args) && spec.args.isCommand ? 2 : Math.min(2 + argsArray.findIndex((arg) => arg?.isCommand), 3);
    }
    if (!spec.subcommands?.length) {
      if (argsArray.some((arg) => arg?.isVariadic)) return 1;
      if (argsArray[0] && !argsArray[0].isOptional) return 2;
    }
  }
  return spec.args && toArray(spec.args).some((arg) => arg?.isDangerous) ? 3 : 2;
}
async function shouldStopAtArg(arg, args, spec) {
  if (arg.startsWith("-")) return true;
  const dotIndex = arg.lastIndexOf(".");
  const hasExtension = dotIndex > 0 && dotIndex < arg.length - 1 && !arg.substring(dotIndex + 1).includes(":");
  const hasFile = arg.includes("/") || hasExtension;
  const hasUrl = URL_PROTOCOLS.some((proto) => arg.startsWith(proto));
  if (!hasFile && !hasUrl) return false;
  if (spec?.options && args.length > 0 && args[args.length - 1] === "-m") {
    const option = spec.options.find(
      (opt) => Array.isArray(opt.name) ? opt.name.includes("-m") : opt.name === "-m"
    );
    if (option?.args && toArray(option.args).some((arg2) => arg2?.isModule)) {
      return false;
    }
  }
  return true;
}
export {
  DEPTH_RULES,
  buildPrefix
};
