const sleep = {
  name: "sleep",
  description: "Delay for a specified amount of time",
  args: {
    name: "duration",
    description: "Duration to sleep (seconds or with suffix like 5s, 2m, 1h)",
    isOptional: false
  }
};
var sleep_default = sleep;
export {
  sleep_default as default
};
