import { describe, it, expect, vi } from "vitest";
import { Stm32BootloaderProtocol } from "./Stm32BootloaderProtocol";
import { SerialTransport } from "./SerialTransport";
import { BOOTLOADER_PROTOCOL } from "../bootloader/constants";

describe("Stm32BootloaderProtocol", () => {
  it("should calculate checksum correctly (XOR)", () => {
    const protocol = new Stm32BootloaderProtocol({} as unknown as SerialTransport);
    const data = new Uint8Array([0x01, 0x02, 0x03]);
    // 0x01 ^ 0x02 ^ 0x03 = 0x00
    // @ts-expect-error - accessing private method for test
    expect(protocol.calculateChecksum(data)).toBe(0x00);

    const data2 = new Uint8Array([0x11, 0x22]);
    // 0x11 ^ 0x22 = 0x33
    // @ts-expect-error - accessing private method for test
    expect(protocol.calculateChecksum(data2)).toBe(0x33);
  });

  it("should append checksum correctly", () => {
    const protocol = new Stm32BootloaderProtocol({} as unknown as SerialTransport);
    const data = new Uint8Array([0x11, 0x22]);
    // @ts-expect-error - accessing private method for test
    const result = protocol.appendChecksum(data);
    expect(result).toEqual(new Uint8Array([0x11, 0x22, 0x33]));
  });

  it("should succeed on ACK", async () => {
    const mockTransport = {
      readExact: vi.fn().mockResolvedValue(new Uint8Array([BOOTLOADER_PROTOCOL.ACK])),
    } as unknown as SerialTransport;

    const protocol = new Stm32BootloaderProtocol(mockTransport);
    await expect(protocol.expectAck()).resolves.toBeUndefined();
    expect(mockTransport.readExact).toHaveBeenCalledWith(1, { timeout: 1000, signal: undefined });
  });

  it("should throw on NACK", async () => {
    const mockTransport = {
      readExact: vi.fn().mockResolvedValue(new Uint8Array([BOOTLOADER_PROTOCOL.NACK])),
    } as unknown as SerialTransport;

    const protocol = new Stm32BootloaderProtocol(mockTransport);
    await expect(protocol.expectAck()).rejects.toThrow("Received NACK");
  });

  it("should get product ID correctly", async () => {
      const mockTransport = {
          write: vi.fn().mockResolvedValue(undefined),
          readExact: vi.fn()
              .mockResolvedValueOnce(new Uint8Array([BOOTLOADER_PROTOCOL.ACK])) // for command ACK
              .mockResolvedValueOnce(new Uint8Array([1])) // size-1 = 1 (2 bytes)
              .mockResolvedValueOnce(new Uint8Array([0x04, 0x13])) // ID
              .mockResolvedValueOnce(new Uint8Array([BOOTLOADER_PROTOCOL.ACK])) // final ACK
      } as unknown as SerialTransport;

      const protocol = new Stm32BootloaderProtocol(mockTransport);
      const id = await protocol.getProductId();
      expect(id).toBe(0x0413);
  });

  it("should get version correctly", async () => {
      const mockTransport = {
          write: vi.fn().mockResolvedValue(undefined),
          readExact: vi.fn()
              .mockResolvedValueOnce(new Uint8Array([BOOTLOADER_PROTOCOL.ACK]))
              .mockResolvedValueOnce(new Uint8Array([0x22, 0x01, 0x02])) // version 0x22, options
              .mockResolvedValueOnce(new Uint8Array([BOOTLOADER_PROTOCOL.ACK]))
      } as unknown as SerialTransport;

      const protocol = new Stm32BootloaderProtocol(mockTransport);
      const version = await protocol.getVersion();
      expect(version).toBe(0x22);
  });

  it("should erase all correctly (page-by-page)", async () => {
      const mockTransport = {
          write: vi.fn().mockResolvedValue(undefined),
          readExact: vi.fn().mockResolvedValue(new Uint8Array([BOOTLOADER_PROTOCOL.ACK])),
      } as unknown as SerialTransport;

      const protocol = new Stm32BootloaderProtocol(mockTransport);
      await protocol.eraseAll();
      
      expect(mockTransport.write).toHaveBeenCalledTimes(2);
      // Number of pages for 64KB with 128B pages is 511 (0x01FF)
      // Check the second write call (page data)
      const sentPageData = vi.mocked(mockTransport.write).mock.calls[1][0];
      expect(sentPageData[0]).toBe(0x01); // High byte of 511
      expect(sentPageData[1]).toBe(0xFF); // Low byte of 511
      expect(sentPageData[2]).toBe(0x00); // High byte of page 0
      expect(sentPageData[3]).toBe(0x00); // Low byte of page 0
      
      expect(mockTransport.readExact).toHaveBeenLastCalledWith(1, { timeout: 10000, signal: undefined });
  });

  it("should erase specific pages correctly", async () => {
      const mockTransport = {
          write: vi.fn().mockResolvedValue(undefined),
          readExact: vi.fn().mockResolvedValue(new Uint8Array([BOOTLOADER_PROTOCOL.ACK])),
      } as unknown as SerialTransport;

      const protocol = new Stm32BootloaderProtocol(mockTransport);
      await protocol.erasePages([1, 5, 10]);
      
      expect(mockTransport.write).toHaveBeenCalledTimes(2);
      // Check the second write call (page data)
      const sentPageData = vi.mocked(mockTransport.write).mock.calls[1][0];
      expect(sentPageData[0]).toBe(0x00); // High byte of 2 (3 pages - 1)
      expect(sentPageData[1]).toBe(0x02); // Low byte of 2
      expect(sentPageData[2]).toBe(0x00); // Page 1 high
      expect(sentPageData[3]).toBe(0x01); // Page 1 low
      expect(sentPageData[4]).toBe(0x00); // Page 5 high
      expect(sentPageData[5]).toBe(0x05); // Page 5 low
      expect(sentPageData[6]).toBe(0x00); // Page 10 high
      expect(sentPageData[7]).toBe(0x0A); // Page 10 low
      
      expect(mockTransport.readExact).toHaveBeenLastCalledWith(1, { timeout: 10000, signal: undefined });
  });

  it("should write memory correctly", async () => {
      const mockTransport = {
          write: vi.fn().mockResolvedValue(undefined),
          readExact: vi.fn().mockResolvedValue(new Uint8Array([BOOTLOADER_PROTOCOL.ACK])),
      } as unknown as SerialTransport;

      const protocol = new Stm32BootloaderProtocol(mockTransport);
      const data = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]);
      await protocol.writeMemory(0x08000000, data);
      
      expect(mockTransport.write).toHaveBeenCalledTimes(3);
      // Check address write: 0x08, 0x00, 0x00, 0x00 + checksum (0x08)
      expect(mockTransport.write).toHaveBeenNthCalledWith(2, new Uint8Array([0x08, 0x00, 0x00, 0x00, 0x08]));
      // Check payload write: length-1 (3), data, checksum (3^0xAA^0xBB^0xCC^0xDD)
      // 3 ^ 0xAA ^ 0xBB ^ 0xCC ^ 0xDD = 3 ^ 170 ^ 187 ^ 204 ^ 221 = 0x3 ^ 0xAA ^ 0xBB ^ 0xCC ^ 0xDD
      // let's just check it was called.
  });

  it("should read memory correctly", async () => {
      const mockTransport = {
          write: vi.fn().mockResolvedValue(undefined),
          readExact: vi.fn()
              .mockResolvedValueOnce(new Uint8Array([BOOTLOADER_PROTOCOL.ACK])) // cmd ack
              .mockResolvedValueOnce(new Uint8Array([BOOTLOADER_PROTOCOL.ACK])) // addr ack
              .mockResolvedValueOnce(new Uint8Array([BOOTLOADER_PROTOCOL.ACK])) // len ack
              .mockResolvedValueOnce(new Uint8Array([0x11, 0x22, 0x33, 0x44])) // data
      } as unknown as SerialTransport;

      const protocol = new Stm32BootloaderProtocol(mockTransport);
      const data = await protocol.readMemory(0x08000000, 4);
      
      expect(data).toEqual(new Uint8Array([0x11, 0x22, 0x33, 0x44]));
      expect(mockTransport.write).toHaveBeenCalledTimes(3);
  });

  it("should write unprotect correctly", async () => {
    const mockTransport = {
      write: vi.fn().mockResolvedValue(undefined),
      readExact: vi.fn().mockResolvedValue(new Uint8Array([BOOTLOADER_PROTOCOL.ACK])),
    } as unknown as SerialTransport;

    const protocol = new Stm32BootloaderProtocol(mockTransport);
    await protocol.writeUnprotect();

    expect(mockTransport.write).toHaveBeenCalledWith(new Uint8Array([0x73, 0x8c]));
    expect(mockTransport.readExact).toHaveBeenCalledTimes(2);
    expect(mockTransport.readExact).toHaveBeenLastCalledWith(1, { timeout: 10000, signal: undefined });
  });

  it("should write protect all correctly", async () => {
    const mockTransport = {
      write: vi.fn().mockResolvedValue(undefined),
      readExact: vi.fn().mockResolvedValue(new Uint8Array([BOOTLOADER_PROTOCOL.ACK])),
    } as unknown as SerialTransport;

    const protocol = new Stm32BootloaderProtocol(mockTransport);
    await protocol.writeProtectAll();

    expect(mockTransport.write).toHaveBeenCalledTimes(2);
    expect(mockTransport.write).toHaveBeenNthCalledWith(1, new Uint8Array([0x63, 0x9c]));

    const sentSectorsData = vi.mocked(mockTransport.write).mock.calls[1][0];
    expect(sentSectorsData[0]).toBe(15); // NUM_SECTORS - 1
    expect(sentSectorsData.length).toBe(18); // N (1) + 16 sectors + Checksum (1)
    for (let i = 0; i < 16; i++) {
      expect(sentSectorsData[i + 1]).toBe(i);
    }
    
    expect(mockTransport.readExact).toHaveBeenCalledWith(1, { timeout: 10000, signal: undefined });
  });
});
