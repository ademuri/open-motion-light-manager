import { ConnectionError, TimeoutError } from "./errors";

export interface ReadOptions {
  timeout?: number;
  signal?: AbortSignal;
}

export class SerialTransport {
  private leftover: Uint8Array | null = null;

  constructor(private port: SerialPort) {}

  async write(data: Uint8Array): Promise<void> {
    if (!this.port.writable) {
      throw new ConnectionError("Port is not writable");
    }
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }

  /**
   * Reads from the serial port until the stream is closed or an error occurs.
   * This is a low-level read. Higher level protocols should use this to build
   * more specific read logic (e.g., read N bytes, read until delimiter).
   */
  async readChunk({ timeout, signal }: ReadOptions = {}): Promise<Uint8Array | null> {
    if (this.leftover && this.leftover.length > 0) {
      const chunk = this.leftover;
      this.leftover = null;
      return chunk;
    }

    if (!this.port.readable) {
      throw new ConnectionError("Port is not readable");
    }

    const reader = this.port.readable.getReader();
    
    let timeoutId: any;
    const abortController = new AbortController();

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      if (!reader.closed) {
          reader.releaseLock();
      }
    };

    const onAbort = () => {
        abortController.abort();
        reader.cancel("Aborted").catch(() => {});
    };

    if (signal) {
        if (signal.aborted) {
            reader.releaseLock();
            throw new DOMException("Aborted", "AbortError");
        }
        signal.addEventListener("abort", onAbort);
    }

    if (timeout) {
        timeoutId = setTimeout(() => {
            abortController.abort();
            reader.cancel("Timeout").catch(() => {});
        }, timeout);
    }

    try {
      const { value, done } = await reader.read();
      if (done) return null;
      return value;
    } catch (e) {
      if (abortController.signal.aborted) {
          if (timeout && !signal?.aborted) {
              throw new TimeoutError();
          }
          throw new DOMException("Aborted", "AbortError");
      }
      throw e;
    } finally {
      cleanup();
    }
  }

  /**
   * Reads exactly `length` bytes.
   */
  async readExact(length: number, options: ReadOptions = {}): Promise<Uint8Array> {
      const buffer = new Uint8Array(length);
      let offset = 0;
      const startTime = Date.now();

      while (offset < length) {
          const remainingTimeout = options.timeout ? options.timeout - (Date.now() - startTime) : undefined;
          if (remainingTimeout !== undefined && remainingTimeout <= 0) {
              throw new TimeoutError();
          }

          const chunk = await this.readChunk({ ...options, timeout: remainingTimeout });
          if (!chunk) {
              throw new ConnectionError("Stream closed before receiving expected length");
          }

          const needed = length - offset;
          const toCopy = Math.min(chunk.length, needed);
          buffer.set(chunk.subarray(0, toCopy), offset);
          
          if (chunk.length > needed) {
              this.leftover = chunk.subarray(needed);
          }

          offset += toCopy;
      }
      return buffer;
  }
}
