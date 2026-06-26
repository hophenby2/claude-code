const C0 = {
  NUL: 0,
  SOH: 1,
  STX: 2,
  ETX: 3,
  EOT: 4,
  ENQ: 5,
  ACK: 6,
  BEL: 7,
  BS: 8,
  HT: 9,
  LF: 10,
  VT: 11,
  FF: 12,
  CR: 13,
  SO: 14,
  SI: 15,
  DLE: 16,
  DC1: 17,
  DC2: 18,
  DC3: 19,
  DC4: 20,
  NAK: 21,
  SYN: 22,
  ETB: 23,
  CAN: 24,
  EM: 25,
  SUB: 26,
  ESC: 27,
  FS: 28,
  GS: 29,
  RS: 30,
  US: 31,
  DEL: 127
};
const ESC = "\x1B";
const BEL = "\x07";
const SEP = ";";
const ESC_TYPE = {
  CSI: 91,
  // [ - Control Sequence Introducer
  OSC: 93,
  // ] - Operating System Command
  DCS: 80,
  // P - Device Control String
  APC: 95,
  // _ - Application Program Command
  PM: 94,
  // ^ - Privacy Message
  SOS: 88,
  // X - Start of String
  ST: 92
  // \ - String Terminator
};
function isC0(byte) {
  return byte < 32 || byte === 127;
}
function isEscFinal(byte) {
  return byte >= 48 && byte <= 126;
}
export {
  BEL,
  C0,
  ESC,
  ESC_TYPE,
  SEP,
  isC0,
  isEscFinal
};
