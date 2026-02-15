import { SerialConnection } from "./SerialConnection";
import { SerialTransport } from "./SerialTransport";
import { ProtobufProtocol } from "./ProtobufProtocol";
import { Stm32BootloaderProtocol } from "./Stm32BootloaderProtocol";
import { SerialRequest, SerialResponse } from "../../../proto_out/serial.ts";

export class SerialService {
  private connection: SerialConnection;
  private transport: SerialTransport;
  private protobuf: ProtobufProtocol;
  private bootloader: Stm32BootloaderProtocol;

  constructor(port: SerialPort) {
    this.connection = new SerialConnection(port);
    this.transport = new SerialTransport(port);
    this.protobuf = new ProtobufProtocol(this.transport);
    this.bootloader = new Stm32BootloaderProtocol(this.transport);
  }

  async open(options: SerialOptions = { baudRate: 115200 }): Promise<void> {
    await this.connection.open(options);
  }

  async close(): Promise<void> {
    await this.connection.close();
  }

  get isOpened(): boolean {
    return this.connection.opened;
  }

  /**
   * Sends a Protobuf request and returns the response.
   * Note: This assumes the port is already open and in the correct mode.
   */
  async sendProtobufRequest(request: SerialRequest, signal?: AbortSignal): Promise<SerialResponse> {
    // We need to ensure locks are managed. 
    // ProtobufProtocol.sendRequest currently uses transport.write and transport.readExact, 
    // which both acquire/release locks internally in the current SerialTransport implementation.
    // However, for atomic operations, we might want to hold the lock.
    // But since SerialTransport.readChunk/readExact currently create new readers each time,
    // it's "safe" but inefficient.
    return this.protobuf.sendRequest(request, signal);
  }

  /**
   * Returns the STM32 Bootloader protocol handler.
   * Switching to bootloader mode usually requires changing baud rate or other settings,
   * so the caller should handle closing/re-opening the port if necessary.
   */
  get stm32(): Stm32BootloaderProtocol {
    return this.bootloader;
  }
}
