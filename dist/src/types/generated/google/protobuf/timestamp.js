function createBaseTimestamp() {
  return { seconds: 0, nanos: 0 };
}
const Timestamp = {
  fromJSON(object) {
    return {
      seconds: isSet(object.seconds) ? globalThis.Number(object.seconds) : 0,
      nanos: isSet(object.nanos) ? globalThis.Number(object.nanos) : 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.seconds !== void 0) {
      obj.seconds = Math.round(message.seconds);
    }
    if (message.nanos !== void 0) {
      obj.nanos = Math.round(message.nanos);
    }
    return obj;
  },
  create(base) {
    return Timestamp.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseTimestamp();
    message.seconds = object.seconds ?? 0;
    message.nanos = object.nanos ?? 0;
    return message;
  }
};
function isSet(value) {
  return value !== null && value !== void 0;
}
export {
  Timestamp
};
