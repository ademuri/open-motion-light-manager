import { useState, useCallback } from "react";
import { CHIP_PARAMETERS } from "../services/bootloader/constants";
import { useSerialService } from "./useSerialPort";

interface FirmwareFlasherResult {
  isFlashing: boolean;
  progress: number; // Percentage 0-100
  flashStatus: string | null;
  flashError: string | null;
  startFlashing: (firmwareData: ArrayBuffer) => Promise<void>;
}

function compareUint8Arrays(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function useFirmwareFlasher(
  port: SerialPort | null
): FirmwareFlasherResult {
  const service = useSerialService(port);
  const [isFlashing, setIsFlashing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flashStatus, setFlashStatus] = useState<string | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);

  const startFlashing = useCallback(
    async (firmwareData: ArrayBuffer) => {
      if (!port || !service) {
        setFlashError("Serial port is not connected.");
        return;
      }
      // Note: We expect the port to be opened with correct settings (even parity) 
      // by the caller (FirmwareUpdate component) for now.
      if (!service.isOpened) {
        setFlashError("Serial port is not open.");
        return;
      }
      if (isFlashing) {
        setFlashError("Flashing process already in progress.");
        return;
      }

      setIsFlashing(true);
      setProgress(0);
      setFlashStatus("Starting firmware flash...");
      setFlashError(null);

      try {
        const totalBytes = firmwareData.byteLength;

        // Boot0 and Reset toggling
        setFlashStatus("Entering bootloader mode...");
        await port.setSignals({ dataTerminalReady: false, requestToSend: false });
        await new Promise((resolve) => setTimeout(resolve, 10));
        await port.setSignals({ dataTerminalReady: false, requestToSend: true });
        await new Promise((resolve) => setTimeout(resolve, 10));
        await port.setSignals({ dataTerminalReady: false, requestToSend: false });
        await new Promise((resolve) => setTimeout(resolve, 10));

        await service.runBootloaderOperation(async (stm32) => {
          await stm32.init();
          setFlashStatus("Bootloader acknowledged.");

          const productId = await stm32.getProductId();
          if (productId !== CHIP_PARAMETERS.PRODUCT_ID) {
            throw new Error(`Incorrect product ID: 0x${productId.toString(16)} (expected 0x${CHIP_PARAMETERS.PRODUCT_ID.toString(16)})`);
          }
          setFlashStatus("Confirmed chip product ID");

          const version = await stm32.getVersion();
          console.log(`Bootloader version: ${version}`);

          setFlashStatus("Write unprotecting...");
          await stm32.writeUnprotect();
          
          // After unprotect, device might reset or need re-init
          await new Promise((resolve) => setTimeout(resolve, 100));
          await stm32.init();

          setFlashStatus("Erasing flash...");
          await stm32.eraseAll();
          setFlashStatus("Erased flash");

          setFlashStatus("Writing firmware...");
          const writeChunkSize = 256;
          let bytesWritten = 0;
          let currentAddress = CHIP_PARAMETERS.PROGRAM_FLASH_START_ADDRESS;

          while (bytesWritten < totalBytes) {
            const chunk = new Uint8Array(firmwareData, bytesWritten, Math.min(writeChunkSize, totalBytes - bytesWritten));
            
            const currentProgress = Math.round((bytesWritten / totalBytes) * 50);
            setProgress(currentProgress);
            setFlashStatus(`Writing flash... ${currentProgress}%`);

            await stm32.writeMemory(currentAddress, chunk);

            bytesWritten += chunk.length;
            currentAddress += chunk.length;
          }

          setFlashStatus("Verifying flash...");
          const readChunkSize = 256;
          let bytesVerified = 0;
          let currentReadAddress = CHIP_PARAMETERS.PROGRAM_FLASH_START_ADDRESS;

          while (bytesVerified < totalBytes) {
            const length = Math.min(readChunkSize, totalBytes - bytesVerified);
            
            const currentProgress = 50 + Math.round((bytesVerified / totalBytes) * 50);
            setProgress(currentProgress);
            setFlashStatus(`Verifying flash... ${currentProgress}%`);

            const readData = await stm32.readMemory(currentReadAddress, length);
            const originalChunk = new Uint8Array(firmwareData, bytesVerified, length);

            if (!compareUint8Arrays(readData, originalChunk)) {
                throw new Error(`Verification failed at address 0x${currentReadAddress.toString(16)}`);
            }

            bytesVerified += length;
            currentReadAddress += length;
          }
        });

        setProgress(100);
        setFlashStatus("Verification successful. Resetting device...");

        // Reset to app mode
        await port.setSignals({ dataTerminalReady: true, requestToSend: true });
        await new Promise((resolve) => setTimeout(resolve, 50));
        await port.setSignals({ dataTerminalReady: true, requestToSend: false });
        setFlashStatus("Device reset. Flash complete.");

      } catch (error) {
        console.error("Firmware flashing failed:", error);
        setFlashError(error instanceof Error ? error.message : String(error));
        // Attempt reset on error
        try {
          await port.setSignals({ dataTerminalReady: true, requestToSend: true });
          await new Promise((resolve) => setTimeout(resolve, 50));
          await port.setSignals({ dataTerminalReady: true, requestToSend: false });
        } catch (_e) { /* ignore reset error */ }
      } finally {
        setIsFlashing(false);
      }
    },
    [port, service, isFlashing]
  );

  return { isFlashing, progress, flashStatus, flashError, startFlashing };
}
