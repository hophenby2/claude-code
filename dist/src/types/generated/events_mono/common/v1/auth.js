function createBasePublicApiAuth() {
  return { account_id: 0, organization_uuid: "", account_uuid: "" };
}
const PublicApiAuth = {
  fromJSON(object) {
    return {
      account_id: isSet(object.account_id) ? globalThis.Number(object.account_id) : 0,
      organization_uuid: isSet(object.organization_uuid) ? globalThis.String(object.organization_uuid) : "",
      account_uuid: isSet(object.account_uuid) ? globalThis.String(object.account_uuid) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.account_id !== void 0) {
      obj.account_id = Math.round(message.account_id);
    }
    if (message.organization_uuid !== void 0) {
      obj.organization_uuid = message.organization_uuid;
    }
    if (message.account_uuid !== void 0) {
      obj.account_uuid = message.account_uuid;
    }
    return obj;
  },
  create(base) {
    return PublicApiAuth.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBasePublicApiAuth();
    message.account_id = object.account_id ?? 0;
    message.organization_uuid = object.organization_uuid ?? "";
    message.account_uuid = object.account_uuid ?? "";
    return message;
  }
};
function isSet(value) {
  return value !== null && value !== void 0;
}
export {
  PublicApiAuth
};
