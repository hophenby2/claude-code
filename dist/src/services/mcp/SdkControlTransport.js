class SdkControlClientTransport {
  constructor(serverName, sendMcpMessage) {
    this.serverName = serverName;
    this.sendMcpMessage = sendMcpMessage;
  }
  serverName;
  sendMcpMessage;
  isClosed = false;
  onclose;
  onerror;
  onmessage;
  async start() {
  }
  async send(message) {
    if (this.isClosed) {
      throw new Error("Transport is closed");
    }
    const response = await this.sendMcpMessage(this.serverName, message);
    if (this.onmessage) {
      this.onmessage(response);
    }
  }
  async close() {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    this.onclose?.();
  }
}
class SdkControlServerTransport {
  constructor(sendMcpMessage) {
    this.sendMcpMessage = sendMcpMessage;
  }
  sendMcpMessage;
  isClosed = false;
  onclose;
  onerror;
  onmessage;
  async start() {
  }
  async send(message) {
    if (this.isClosed) {
      throw new Error("Transport is closed");
    }
    this.sendMcpMessage(message);
  }
  async close() {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    this.onclose?.();
  }
}
export {
  SdkControlClientTransport,
  SdkControlServerTransport
};
