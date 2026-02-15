import { SerialTransport } from "./SerialTransport";
import { BOOTLOADER_PROTOCOL, COMMANDS } from "../bootloader/constants";
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

  async expectAck(signal?: AbortSignal): Promise<void> {
    const response = await this.transport.readExact(1, { timeout: 100, signal });
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
    
    // Response format: ACK, length (N), ID bytes (N+1), ACK
    // Based on bootloaderCommands.ts, it expects 5 bytes total: 
    // [ACK, size-1, byte1, byte2, ACK]
    // Wait, bootloaderCommands.ts read the whole thing at once.
    // Let's re-examine bootloaderCommands.ts logic.
    /*
      const { data, error } = await writeAndReadSerial(writer, reader, COMMANDS.GET_ID);
      // data.length !== 5
      // data[4] !== ACK
      // id = (data[2] << 8) | data[3];
    */
    // My transport readExact doesn't automatically read until ACK unless I tell it.
    
    const sizeByte = await this.transport.readExact(1, { timeout: 100, signal });
    const size = sizeByte[0] + 1;
    const idBytes = await this.transport.readExact(size, { timeout: 100, signal });
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
    const data = await this.transport.readExact(3, { timeout: 100, signal });
    await this.expectAck(signal);
    
    return data[0];
  }

  async writeUnprotect(signal?: AbortSignal): Promise<void> {
      await this.transport.write(COMMANDS.WRITE_UNPROTECT);
      await this.expectAck(signal);
      await this.expectAck(signal); // Second ACK after completion
  }

  async eraseAll(signal?: AbortSignal): Promise<void> {
      await this.transport.write(COMMANDS.ERASE_EXTENDED);
      await this.expectAck(signal);
      
      // Special case: 0xFFFF 0x00 for all sectors
      const eraseCmd = new Uint8Array([0xFF, 0xFF]);
      await this.transport.write(this.appendChecksum(eraseCmd));
      
      // Erase can take a long time
      await this.expectAck(signal);
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
