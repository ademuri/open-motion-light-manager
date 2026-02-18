import { SerialService } from "./SerialService";
import { CHIP_PARAMETERS } from "../bootloader/constants";

export type FlasherState =
  | 'idle'
  | 'entering-bootloader'
  | 'initializing'
  | 'unprotecting'
  | 'erasing'
  | 'writing'
  | 'verifying'
  | 'resetting'
  | 'complete'
  | 'error';

export interface FlasherProgress {
  state: FlasherState;
  progress: number;
  message: string;
}

export type ProgressCallback = (progress: FlasherProgress) => void;

export class FlasherService {
  constructor(private serialService: SerialService) {}

  private async wait(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        reject(signal.reason);
      }, { once: true });
    });
  }

  private compareUint8Arrays(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  async flash(
    firmwareData: ArrayBuffer,
    onProgress: ProgressCallback,
    signal?: AbortSignal
  ): Promise<void> {
    const totalBytes = firmwareData.byteLength;

    try {
      // 1. Entering bootloader mode
      onProgress({ state: 'entering-bootloader', progress: 0, message: 'Entering bootloader mode...' });
      
      // Use direct signal manipulation from serial service (via connection)
      // Note: we might need to expose setSignals on SerialService or access connection
      // For now, let's assume we can add setSignals to SerialService
      
      await this.serialService.setSignals({ dataTerminalReady: false, requestToSend: false });
      await this.wait(10, signal);
      await this.serialService.setSignals({ dataTerminalReady: false, requestToSend: true });
      await this.wait(10, signal);
      await this.serialService.setSignals({ dataTerminalReady: false, requestToSend: false });
      await this.wait(10, signal);

      await this.serialService.runBootloaderOperation(async (stm32) => {
        // 2. Initializing
        onProgress({ state: 'initializing', progress: 0, message: 'Initializing bootloader...' });
        await stm32.init(signal);

        const productId = await stm32.getProductId(signal);
        if (productId !== CHIP_PARAMETERS.PRODUCT_ID) {
          throw new Error(`Incorrect product ID: 0x${productId.toString(16)} (expected 0x${CHIP_PARAMETERS.PRODUCT_ID.toString(16)})`);
        }

        // 3. Unprotecting
        onProgress({ state: 'unprotecting', progress: 0, message: 'Write unprotecting...' });
        await stm32.writeUnprotect(signal);
        await this.wait(100, signal);
        await stm32.init(signal);

        // 4. Erasing
        onProgress({ state: 'erasing', progress: 0, message: 'Erasing flash...' });
        const numPagesToErase = Math.ceil(totalBytes / CHIP_PARAMETERS.FLASH_PAGE_SIZE);
        const pagesToErase = Array.from({ length: numPagesToErase }, (_, i) => i);
        await stm32.erasePages(pagesToErase, signal);

        // 5. Writing
        onProgress({ state: 'writing', progress: 0, message: 'Writing firmware...' });
        const writeChunkSize = 256;
        let bytesWritten = 0;
        let currentAddress = CHIP_PARAMETERS.PROGRAM_FLASH_START_ADDRESS;

        while (bytesWritten < totalBytes) {
          if (signal?.aborted) throw signal.reason;

          const chunk = new Uint8Array(firmwareData, bytesWritten, Math.min(writeChunkSize, totalBytes - bytesWritten));
          await stm32.writeMemory(currentAddress, chunk, signal);

          bytesWritten += chunk.length;
          currentAddress += chunk.length;
          onProgress({
            state: 'writing',
            progress: Math.round((bytesWritten / totalBytes) * 50),
            message: `Writing flash... ${Math.round((bytesWritten / totalBytes) * 100)}%`
          });
        }

        // 6. Verifying
        onProgress({ state: 'verifying', progress: 50, message: 'Verifying flash...' });
        const readChunkSize = 256;
        let bytesVerified = 0;
        let currentReadAddress = CHIP_PARAMETERS.PROGRAM_FLASH_START_ADDRESS;

        while (bytesVerified < totalBytes) {
          if (signal?.aborted) throw signal.reason;

          const length = Math.min(readChunkSize, totalBytes - bytesVerified);
          const readData = await stm32.readMemory(currentReadAddress, length, signal);
          const originalChunk = new Uint8Array(firmwareData, bytesVerified, length);

          if (!this.compareUint8Arrays(readData, originalChunk)) {
            throw new Error(`Verification failed at address 0x${currentReadAddress.toString(16)}`);
          }

          bytesVerified += length;
          currentReadAddress += length;
          onProgress({
            state: 'verifying',
            progress: 50 + Math.round((bytesVerified / totalBytes) * 50),
            message: `Verifying flash... ${Math.round((bytesVerified / totalBytes) * 100)}%`
          });
        }
      }, signal);

      // 7. Resetting
      onProgress({ state: 'resetting', progress: 100, message: 'Resetting device...' });
      await this.serialService.resetMcu();
      
      onProgress({ state: 'complete', progress: 100, message: 'Flash complete.' });

    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        onProgress({ state: 'idle', progress: 0, message: 'Flash cancelled.' });
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        onProgress({ state: 'error', progress: 0, message: `Flash failed: ${errorMessage}` });
        
        // Attempt reset on error
        try {
          await this.serialService.resetMcu();
        } catch { /* ignore reset error */ }
        throw error;
      }
    }
  }
}
