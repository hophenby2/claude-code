import { Timestamp } from "../../../google/protobuf/timestamp.js";
import { PublicApiAuth } from "../../common/v1/auth.js";
function createBaseGrowthbookExperimentEvent() {
  return {
    event_id: "",
    timestamp: void 0,
    experiment_id: "",
    variation_id: 0,
    environment: "",
    user_attributes: "",
    experiment_metadata: "",
    device_id: "",
    auth: void 0,
    session_id: "",
    anonymous_id: "",
    event_metadata_vars: ""
  };
}
const GrowthbookExperimentEvent = {
  fromJSON(object) {
    return {
      event_id: isSet(object.event_id) ? globalThis.String(object.event_id) : "",
      timestamp: isSet(object.timestamp) ? fromJsonTimestamp(object.timestamp) : void 0,
      experiment_id: isSet(object.experiment_id) ? globalThis.String(object.experiment_id) : "",
      variation_id: isSet(object.variation_id) ? globalThis.Number(object.variation_id) : 0,
      environment: isSet(object.environment) ? globalThis.String(object.environment) : "",
      user_attributes: isSet(object.user_attributes) ? globalThis.String(object.user_attributes) : "",
      experiment_metadata: isSet(object.experiment_metadata) ? globalThis.String(object.experiment_metadata) : "",
      device_id: isSet(object.device_id) ? globalThis.String(object.device_id) : "",
      auth: isSet(object.auth) ? PublicApiAuth.fromJSON(object.auth) : void 0,
      session_id: isSet(object.session_id) ? globalThis.String(object.session_id) : "",
      anonymous_id: isSet(object.anonymous_id) ? globalThis.String(object.anonymous_id) : "",
      event_metadata_vars: isSet(object.event_metadata_vars) ? globalThis.String(object.event_metadata_vars) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.event_id !== void 0) {
      obj.event_id = message.event_id;
    }
    if (message.timestamp !== void 0) {
      obj.timestamp = message.timestamp.toISOString();
    }
    if (message.experiment_id !== void 0) {
      obj.experiment_id = message.experiment_id;
    }
    if (message.variation_id !== void 0) {
      obj.variation_id = Math.round(message.variation_id);
    }
    if (message.environment !== void 0) {
      obj.environment = message.environment;
    }
    if (message.user_attributes !== void 0) {
      obj.user_attributes = message.user_attributes;
    }
    if (message.experiment_metadata !== void 0) {
      obj.experiment_metadata = message.experiment_metadata;
    }
    if (message.device_id !== void 0) {
      obj.device_id = message.device_id;
    }
    if (message.auth !== void 0) {
      obj.auth = PublicApiAuth.toJSON(message.auth);
    }
    if (message.session_id !== void 0) {
      obj.session_id = message.session_id;
    }
    if (message.anonymous_id !== void 0) {
      obj.anonymous_id = message.anonymous_id;
    }
    if (message.event_metadata_vars !== void 0) {
      obj.event_metadata_vars = message.event_metadata_vars;
    }
    return obj;
  },
  create(base) {
    return GrowthbookExperimentEvent.fromPartial(base ?? {});
  },
  fromPartial(object) {
    const message = createBaseGrowthbookExperimentEvent();
    message.event_id = object.event_id ?? "";
    message.timestamp = object.timestamp ?? void 0;
    message.experiment_id = object.experiment_id ?? "";
    message.variation_id = object.variation_id ?? 0;
    message.environment = object.environment ?? "";
    message.user_attributes = object.user_attributes ?? "";
    message.experiment_metadata = object.experiment_metadata ?? "";
    message.device_id = object.device_id ?? "";
    message.auth = object.auth !== void 0 && object.auth !== null ? PublicApiAuth.fromPartial(object.auth) : void 0;
    message.session_id = object.session_id ?? "";
    message.anonymous_id = object.anonymous_id ?? "";
    message.event_metadata_vars = object.event_metadata_vars ?? "";
    return message;
  }
};
function fromTimestamp(t) {
  let millis = (t.seconds || 0) * 1e3;
  millis += (t.nanos || 0) / 1e6;
  return new globalThis.Date(millis);
}
function fromJsonTimestamp(o) {
  if (o instanceof globalThis.Date) {
    return o;
  } else if (typeof o === "string") {
    return new globalThis.Date(o);
  } else {
    return fromTimestamp(Timestamp.fromJSON(o));
  }
}
function isSet(value) {
  return value !== null && value !== void 0;
}
export {
  GrowthbookExperimentEvent
};
