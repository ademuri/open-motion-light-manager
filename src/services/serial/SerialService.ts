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
  private operationLock: Promise<void> = Promise.resolve();

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
   * Executes a serial operation with a lock to prevent concurrent access.
   */
  private async runOperation<T>(operation: () => Promise<T>): Promise<T> {
    const currentLock = this.operationLock;
    let releaseLock: () => void;
    this.operationLock = new Promise((resolve) => {
      releaseLock = resolve;
    });

    try {
      await currentLock;
      return await operation();
    } finally {
      releaseLock!();
    }
  }

  /**
   * Sends a Protobuf request and returns the response.
   * Note: This assumes the port is already open and in the correct mode.
   */
  async sendProtobufRequest(request: SerialRequest, signal?: AbortSignal): Promise<SerialResponse> {
    return this.runOperation(() => this.protobuf.sendRequest(request, signal));
  }

  /**
   * Runs an operation using the STM32 Bootloader protocol.
   * The callback receives the bootloader protocol instance.
   */
  async runBootloaderOperation<T>(operation: (bootloader: Stm32BootloaderProtocol) => Promise<T>): Promise<T> {
    return this.runOperation(() => operation(this.bootloader));
  }

  /**
   * Returns the STM32 Bootloader protocol handler.
   * Note: Using this directly is not thread-safe. Use runBootloaderOperation instead
   * if concurrent access is possible.
   */
  get stm32(): Stm32BootloaderProtocol {
    return this.bootloader;
  }
}
