import { ConnectionError } from "./errors";

export class SerialConnection {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private _opened = false;

  constructor(private port: SerialPort) {}

  get opened() {
    return this._opened;
  }

  async open(options: SerialOptions) {
    if (this._opened) return;
    await this.port.open(options);
    this._opened = true;
  }

  async close() {
    this.releaseLocks();
    if (this._opened) {
        await this.port.close();
        this._opened = false;
    }
  }

  getReader(): ReadableStreamDefaultReader<Uint8Array> {
    if (!this.port.readable) throw new ConnectionError("Port not readable");
    if (!this.reader) {
      this.reader = this.port.readable.getReader();
    }
    return this.reader;
  }

  getWriter(): WritableStreamDefaultWriter<Uint8Array> {
    if (!this.port.writable) throw new ConnectionError("Port not writable");
    if (!this.writer) {
      this.writer = this.port.writable.getWriter();
    }
    return this.writer;
  }

  releaseLocks() {
    if (this.reader) {
      this.reader.releaseLock();
      this.reader = null;
    }
    if (this.writer) {
      this.writer.releaseLock();
      this.writer = null;
    }
  }
}
