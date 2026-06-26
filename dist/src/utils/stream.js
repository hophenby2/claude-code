class Stream {
  constructor(returned) {
    this.returned = returned;
  }
  returned;
  queue = [];
  readResolve;
  readReject;
  isDone = false;
  hasError;
  started = false;
  [Symbol.asyncIterator]() {
    if (this.started) {
      throw new Error("Stream can only be iterated once");
    }
    this.started = true;
    return this;
  }
  next() {
    if (this.queue.length > 0) {
      return Promise.resolve({
        done: false,
        value: this.queue.shift()
      });
    }
    if (this.isDone) {
      return Promise.resolve({ done: true, value: void 0 });
    }
    if (this.hasError) {
      return Promise.reject(this.hasError);
    }
    return new Promise((resolve, reject) => {
      this.readResolve = resolve;
      this.readReject = reject;
    });
  }
  enqueue(value) {
    if (this.readResolve) {
      const resolve = this.readResolve;
      this.readResolve = void 0;
      this.readReject = void 0;
      resolve({ done: false, value });
    } else {
      this.queue.push(value);
    }
  }
  done() {
    this.isDone = true;
    if (this.readResolve) {
      const resolve = this.readResolve;
      this.readResolve = void 0;
      this.readReject = void 0;
      resolve({ done: true, value: void 0 });
    }
  }
  error(error) {
    this.hasError = error;
    if (this.readReject) {
      const reject = this.readReject;
      this.readResolve = void 0;
      this.readReject = void 0;
      reject(error);
    }
  }
  return() {
    this.isDone = true;
    if (this.returned) {
      this.returned();
    }
    return Promise.resolve({ done: true, value: void 0 });
  }
}
export {
  Stream
};
