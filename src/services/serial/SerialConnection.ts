import { ConnectionError } from "./errors";

export class SerialConnection {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  constructor(private port: SerialPort) {}

  get opened() {
    // A port is "open" if its readable/writable streams exist.
    // However, if we've already acquired a reader/writer, they might still be open
    // even if we haven't checked port.readable lately.
    // For Web Serial, port.readable/writable are non-null when the port is open.
    return !!(this.port.readable && this.port.writable);
  }

  async open(options: SerialOptions) {
    if (this.opened) {
        // If already open, we might need to close and re-open to apply new options
        // But for now, let's just return if it's already what we want?
        // Actually, Web Serial doesn't let you change options without closing.
        // Let's be safe and close first if we are called with open.
        // Wait, maybe the caller should handle that. 
        // For now, let's just check if it's already open.
        return;
    }
    await this.port.open(options);
  }

  async close() {
    this.releaseLocks();
    if (this.opened) {
        await this.port.close();
    }
  }

  getReader(): ReadableStreamDefaultReader<Uint8Array> {
    if (!this.port.readable) {
        this.reader = null;
        throw new ConnectionError("Port not readable");
    }
    if (!this.reader) {
      this.reader = this.port.readable.getReader();
    }
    return this.reader;
  }

  getWriter(): WritableStreamDefaultWriter<Uint8Array> {
    if (!this.port.writable) {
        this.writer = null;
        throw new ConnectionError("Port not writable");
    }
    if (!this.writer) {
      this.writer = this.port.writable.getWriter();
    }
    return this.writer;
  }

  releaseReader() {
    if (this.reader) {
      try {
        this.reader.releaseLock();
      } catch {
        // Ignore errors if already released
      }
      this.reader = null;
    }
  }

  releaseWriter() {
    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch {
        // Ignore errors if already released
      }
      this.writer = null;
    }
  }

  releaseLocks() {
    this.releaseReader();
    this.releaseWriter();
  }

  async setSignals(signals: SerialOutputSignals) {
    await this.port.setSignals(signals);
  }
}
