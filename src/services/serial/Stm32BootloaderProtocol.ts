import { SerialTransport } from "./SerialTransport";
import { BOOTLOADER_PROTOCOL, COMMANDS, CHIP_PARAMETERS } from "../bootloader/constants";
import { ProtocolError } from "./errors";

export class Stm32BootloaderProtocol {
  constructor(private transport: SerialTransport) {}

  private calculateChecksum(data: Uint8Array): number {
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum ^= data[i];
    }
    return checksum;
  }

  private appendChecksum(data: Uint8Array): Uint8Array {
    const result = new Uint8Array(data.length + 1);
    result.set(data, 0);
    result.set([this.calculateChecksum(data)], data.length);
    return result;
  }

  async expectAck(signal?: AbortSignal, timeout: number = 1000): Promise<void> {
    const response = await this.transport.readExact(1, { timeout, signal });
    if (response[0] === BOOTLOADER_PROTOCOL.NACK) {
      throw new ProtocolError("Received NACK from bootloader");
    }
    if (response[0] !== BOOTLOADER_PROTOCOL.ACK) {
      throw new ProtocolError(`Expected ACK (0x79), received 0x${response[0].toString(16).padStart(2, "0")}`);
    }
  }

  async init(signal?: AbortSignal): Promise<void> {
    await this.transport.write(new Uint8Array([BOOTLOADER_PROTOCOL.INIT]));
    await this.expectAck(signal);
  }

  async getProductId(signal?: AbortSignal): Promise<number> {
    await this.transport.write(COMMANDS.GET_ID);
    await this.expectAck(signal);
    
    const sizeByte = await this.transport.readExact(1, { timeout: 1000, signal });
    const size = sizeByte[0] + 1;
    const idBytes = await this.transport.readExact(size, { timeout: 1000, signal });
    await this.expectAck(signal);

    let id = 0;
    for (let i = 0; i < idBytes.length; i++) {
        id = (id << 8) | idBytes[i];
    }
    return id;
  }

  async getVersion(signal?: AbortSignal): Promise<number> {
    await this.transport.write(COMMANDS.GET_VERSION);
    await this.expectAck(signal);
    
    // Response: ACK, version, option1, option2, ACK
    const data = await this.transport.readExact(3, { timeout: 1000, signal });
    await this.expectAck(signal);
    
    return data[0];
  }

  async writeUnprotect(signal?: AbortSignal): Promise<void> {
      await this.transport.write(COMMANDS.WRITE_UNPROTECT);
      await this.expectAck(signal);
      await this.expectAck(signal, 10000); // Wait for mass erase completion
  }

  /**
   * Erases specific flash pages.
   * @param pages Array of page indices to erase.
   * @param signal AbortSignal for cancellation.
   */
  async erasePages(pages: number[], signal?: AbortSignal): Promise<void> {
      if (pages.length === 0) return;

      await this.transport.write(COMMANDS.ERASE_EXTENDED);
      await this.expectAck(signal);
      
      const numPages = pages.length - 1;
      const pageData = new Uint8Array(2 + pages.length * 2);
      
      // Number of pages (2 bytes, N-1)
      pageData[0] = numPages >> 8;
      pageData[1] = numPages & 0xFF;
      
      // Page indices (2 bytes each)
      for (let i = 0; i < pages.length; i++) {
          pageData[2 + i * 2] = pages[i] >> 8;
          pageData[2 + i * 2 + 1] = pages[i] & 0xFF;
      }

      await this.transport.write(this.appendChecksum(pageData));
      await this.expectAck(signal, 10000);
  }

  // Erases all flash pages. Erases page-by-page because the `ERASE` command is
  // not supported on the MCU we use.
  async eraseAll(signal?: AbortSignal): Promise<void> {
      const numPages = Math.ceil(CHIP_PARAMETERS.PROGRAM_FLASH_SIZE / CHIP_PARAMETERS.FLASH_PAGE_SIZE);
      const pages = Array.from({ length: numPages }, (_, i) => i);
      await this.erasePages(pages, signal);
  }

  async writeMemory(address: number, data: Uint8Array, signal?: AbortSignal): Promise<void> {
      if (data.length > 256 || data.length === 0 || data.length % 4 !== 0) {
          throw new ProtocolError(`Invalid data length for writeMemory: ${data.length}`);
      }

      await this.transport.write(COMMANDS.WRITE_MEMORY);
      await this.expectAck(signal);

      const addrBytes = new Uint8Array([
          (address >> 24) & 0xFF,
          (address >> 16) & 0xFF,
          (address >> 8) & 0xFF,
          address & 0xFF
      ]);
      await this.transport.write(this.appendChecksum(addrBytes));
      await this.expectAck(signal);

      const payload = new Uint8Array(data.length + 1);
      payload[0] = data.length - 1;
      payload.set(data, 1);
      await this.transport.write(this.appendChecksum(payload));
      await this.expectAck(signal);
  }

  async readMemory(address: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
      if (length > 256 || length === 0 || length % 4 !== 0) {
          throw new ProtocolError(`Invalid length for readMemory: ${length}`);
      }

      await this.transport.write(COMMANDS.READ_MEMORY);
      await this.expectAck(signal);

      const addrBytes = new Uint8Array([
          (address >> 24) & 0xFF,
          (address >> 16) & 0xFF,
          (address >> 8) & 0xFF,
          address & 0xFF
      ]);
      await this.transport.write(this.appendChecksum(addrBytes));
      await this.expectAck(signal);

      const lenPayload = new Uint8Array([length - 1, (length - 1) ^ 0xFF]);
      await this.transport.write(lenPayload);
      await this.expectAck(signal);

      return await this.transport.readExact(length, { timeout: 500, signal });
  }
}
