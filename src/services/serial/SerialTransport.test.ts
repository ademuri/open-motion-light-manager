import { describe, it, expect, vi } from "vitest";
import { SerialTransport } from "./SerialTransport";
import { ConnectionError } from "./errors";

describe("SerialTransport", () => {
  it("should read exactly the requested number of bytes", async () => {
    const mockData = new Uint8Array([1, 2, 3, 4, 5]);
    let readCalled = false;

    const mockReader = {
      read: vi.fn().mockImplementation(async () => {
        if (readCalled) return { done: true, value: undefined };
        readCalled = true;
        return { done: false, value: mockData };
      }),
      releaseLock: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
      closed: false,
    };

    const mockReadable = {
      getReader: vi.fn().mockReturnValue(mockReader),
    };

    const mockPort = {
      readable: mockReadable,
      writable: {},
    } as any as SerialPort;

    const transport = new SerialTransport(mockPort);
    
    // We want to read 2 bytes. 
    // The first readChunk will return [1, 2, 3, 4, 5].
    // readExact should take [1, 2] and somehow not lose [3, 4, 5]? 
    // Actually, currently it WILL lose them.
    
    const result = await transport.readExact(2);
    expect(result).toEqual(new Uint8Array([1, 2]));
  });

  it("should not lose data between readExact calls", async () => {
    const mockData = new Uint8Array([1, 2, 3, 4, 5]);
    let readCalled = false;

    const mockReader = {
      read: vi.fn().mockImplementation(async () => {
        if (readCalled) return { done: true, value: undefined };
        readCalled = true;
        return { done: false, value: mockData };
      }),
      releaseLock: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
      closed: false,
    };

    const mockReadable = {
      getReader: vi.fn().mockReturnValue(mockReader),
    };

    const mockPort = {
      readable: mockReadable,
      writable: {},
    } as any as SerialPort;

    const transport = new SerialTransport(mockPort);
    
    // First read 1 byte (the length byte in protobuf protocol)
    const lengthResult = await transport.readExact(1);
    expect(lengthResult).toEqual(new Uint8Array([1]));
    
    // Next read should get the rest of the data
    const dataResult = await transport.readExact(4);
    expect(dataResult).toEqual(new Uint8Array([2, 3, 4, 5]));
  });

  it("should handle multiple chunks to fulfill readExact", async () => {
      let chunkIdx = 0;
      const chunks = [
          new Uint8Array([1, 2]),
          new Uint8Array([3, 4]),
          new Uint8Array([5])
      ];

      const mockReader = {
        read: vi.fn().mockImplementation(async () => {
          if (chunkIdx >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: chunks[chunkIdx++] };
        }),
        releaseLock: vi.fn(),
        cancel: vi.fn().mockResolvedValue(undefined),
        closed: false,
      };

      const mockReadable = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      const mockPort = {
        readable: mockReadable,
        writable: {},
      } as any as SerialPort;

      const transport = new SerialTransport(mockPort);
      const result = await transport.readExact(5);
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
      expect(mockReadable.getReader).toHaveBeenCalledTimes(3);
  });
});
