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
    this.transport = new SerialTransport(this.connection);
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
  private async runOperation<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
      throw signal.reason;
    }

    const currentLock = this.operationLock;
    let releaseLock: () => void;
    this.operationLock = new Promise((resolve) => {
      releaseLock = resolve;
    });

    try {
      if (signal) {
        await Promise.race([
          currentLock,
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          }),
        ]);
      } else {
        await currentLock;
      }

      if (signal?.aborted) {
        throw signal.reason;
      }

      this.transport.clearLeftover();
      const result = await operation();
      return result;
    } finally {
      this.connection.releaseLocks();
      releaseLock!();
    }
  }

  /**
   * Sends a Protobuf request and returns the response.
   * Note: This assumes the port is already open and in the correct mode.
   */
  async sendProtobufRequest(request: SerialRequest, signal?: AbortSignal): Promise<SerialResponse> {
    return this.runOperation(() => this.protobuf.sendRequest(request, signal), signal);
  }

  /**
   * Runs an operation using the STM32 Bootloader protocol.
   * The callback receives the bootloader protocol instance.
   */
  async runBootloaderOperation<T>(
    operation: (bootloader: Stm32BootloaderProtocol) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    return this.runOperation(() => operation(this.bootloader), signal);
  }

  /**
   * Returns the STM32 Bootloader protocol handler.
   * Note: Using this directly is not thread-safe. Use runBootloaderOperation instead
   * if concurrent access is possible.
   */
  get stm32(): Stm32BootloaderProtocol {
    return this.bootloader;
  }

  /**
   * Resets the MCU using DTR/RTS signals.
   */
  async resetMcu(): Promise<void> {
    // Reset to app mode (standard sequence used in this project)
    await this.connection.setSignals({ dataTerminalReady: true, requestToSend: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await this.connection.setSignals({ dataTerminalReady: true, requestToSend: false });
  }

  /**
   * Sets the serial port control signals.
   */
  async setSignals(signals: SerialOutputSignals): Promise<void> {
    await this.connection.setSignals(signals);
  }
}
