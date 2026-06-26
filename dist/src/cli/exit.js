function cliError(msg) {
  if (msg) console.error(msg);
  process.exit(1);
  return void 0;
}
function cliOk(msg) {
  if (msg) process.stdout.write(msg + "\n");
  process.exit(0);
  return void 0;
}
export {
  cliError,
  cliOk
};
