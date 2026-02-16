import { describe, it, expect, vi, beforeEach } from "vitest";
import { SerialService } from "./SerialService";
import { ConnectionError } from "./errors";

describe("SerialService Concurrent Operations", () => {
  let mockPort: any;
  let service: SerialService;

  beforeEach(() => {
    mockPort = {
      readable: {
        getReader: vi.fn(),
      },
      writable: {
        getWriter: vi.fn(),
      },
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      setSignals: vi.fn().mockResolvedValue(undefined),
    };
    service = new SerialService(mockPort);
  });

  it("should serialize operations using the lock", async () => {
    let op1Started = false;
    let op1Finished = false;
    let op2Started = false;

    const op1 = service.runBootloaderOperation(async () => {
      op1Started = true;
      await new Promise((resolve) => setTimeout(resolve, 50));
      op1Finished = true;
      return "op1";
    });

    // Wait a tick for op1 to start
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(op1Started).toBe(true);
    expect(op2Started).toBe(false);

    const op2 = service.runBootloaderOperation(async () => {
      op2Started = true;
      return "op2";
    });

    expect(op2Started).toBe(false);

    await op1;
    expect(op1Finished).toBe(true);
    
    // After op1 finishes, op2 should start. 
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(op2Started).toBe(true);
    await op2;
  });

  it("should handle port closure during an operation", async () => {
    let resolveRead: (value: any) => void;
    const readPromise = new Promise((resolve) => {
      resolveRead = resolve;
    });

    const mockReader = {
      read: vi.fn().mockReturnValue(readPromise),
      releaseLock: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    mockPort.readable.getReader.mockReturnValue(mockReader);

    const flashPromise = service.runBootloaderOperation(async (stm32) => {
        return await stm32.expectAck();
    });

    // Wait for it to start and get to the read() call
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Simulate the port closing while read is pending
    // We don't nullify mockPort.readable yet because expectAck already called getReader()
    resolveRead!({ done: true, value: undefined });

    await expect(flashPromise).rejects.toThrow("Stream closed before receiving expected length");
  });

  it("should clear leftovers between operations", async () => {
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ value: new Uint8Array([0x79, 0x11, 0x22]), done: false })
        .mockResolvedValueOnce({ value: new Uint8Array([0x79]), done: false }),
      releaseLock: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    mockPort.readable.getReader.mockReturnValue(mockReader);

    // First operation reads only 1 byte, leaving [0x11, 0x22] in leftovers
    await service.runBootloaderOperation(async (stm32) => {
      await stm32.expectAck();
    });

    // Second operation should NOT see 0x11, it should read fresh from the reader
    await service.runBootloaderOperation(async (stm32) => {
      await stm32.expectAck();
    });

    expect(mockReader.read).toHaveBeenCalledTimes(2);
  });
});
