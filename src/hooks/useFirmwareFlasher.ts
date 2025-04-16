import { useState, useCallback } from "react";
import {
  initBootloader,
  getProductId,
  CHIP_PARAMETERS,
  writeUnprotectAll,
  eraseAllFlash,
  getVersion,
  writeFlash,
  readFlash,
  writeProtectAll,
} from "../services/bootloader";

interface FirmwareFlasherResult {
  isFlashing: boolean;
  progress: number; // Percentage 0-100
  flashStatus: string | null;
  flashError: string | null;
  startFlashing: (firmwareData: ArrayBuffer) => Promise<void>;
}

function compareUint8Arrays(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function useFirmwareFlasher(
  port: SerialPort | null
): FirmwareFlasherResult {
  const [isFlashing, setIsFlashing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flashStatus, setFlashStatus] = useState<string | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);

  const startFlashing = useCallback(
    async (firmwareData: ArrayBuffer) => {
      if (!port) {
        setFlashError("Serial port is not connected.");
        return;
      }
      if (!port.writable || !port.readable) {
        setFlashError("Serial port is not writable or readable.");
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

      // Acquire writer and reader - must be released in finally block
      const writer = port.writable.getWriter();
      const reader = port.readable.getReader();

      try {
        const totalBytes = firmwareData.byteLength;
        console.log(`Firmware size: ${totalBytes} bytes`);

        // Set Boot0 and toggle reset
        // Boot0 is connected to DTR.
        // ~Reset is connected to RTS.
        // Both are inverted.
        await port.setSignals({
          dataTerminalReady: false,
          requestToSend: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
        await port.setSignals({
          dataTerminalReady: false,
          requestToSend: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
        await port.setSignals({
          dataTerminalReady: false,
          requestToSend: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 10));

        let bootloaderInitError = await initBootloader(writer, reader);
        if (bootloaderInitError) {
          setFlashError(bootloaderInitError);
          return;
        }

        console.log("Bootloader ACK received.");
        setFlashStatus("Bootloader acknowledged.");
        await new Promise((resolve) => setTimeout(resolve, 50));

        const { id: productId, error: productIdError } = await getProductId(
          writer,
          reader
        );
        if (productIdError) {
          setFlashError(`Error while getting product ID: ${productIdError}`);
          return;
        }
        if (productId !== CHIP_PARAMETERS.PRODUCT_ID) {
          setFlashError(
            `Got incorrect product ID: ${productId} instead of ${CHIP_PARAMETERS.PRODUCT_ID}`
          );
          return;
        }
        setFlashStatus("Confirmed chip product ID");

        const { version: version, error: versionError } = await getVersion(
          writer,
          reader
        );
        if (versionError) {
          setFlashError(`Error while getting product ID: ${versionError}`);
          return;
        }
        console.log(`Bootloader version: ${version}`);

        // await new Promise((resolve) => setTimeout(resolve, 10));
        setFlashStatus("Write unprotecting...");
        const writeUnprotectError = await writeUnprotectAll(writer, reader);
        if (writeUnprotectError) {
          setFlashError(
            `Error while writing unprotect: ${writeUnprotectError}`
          );
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
        bootloaderInitError = await initBootloader(writer, reader);
        if (bootloaderInitError) {
          setFlashError(bootloaderInitError);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
        console.log("getProductId:", await getProductId(writer, reader));

        // For debugging the verification step
        const doWrite = true;

        if (doWrite) {
          setFlashStatus("Erasing flash...");
          const eraseError = await eraseAllFlash(writer, reader);
          if (eraseError) {
            setFlashError(`Error while erasing flash: ${eraseError}`);
            return;
          }
          setFlashStatus("Erased flash");

          setFlashStatus("Writing firmware...");

          const chunkSize = 256; // Max chunk size for STM32 bootloader write command
          let bytesWritten = 0;
          let currentAddress = CHIP_PARAMETERS.PROGRAM_FLASH_START_ADDRESS;
          let writeError: string | null = null;

          while (bytesWritten < totalBytes) {
            const remainingBytes = totalBytes - bytesWritten;
            const currentChunkSize = Math.min(chunkSize, remainingBytes);

            const chunk = new Uint8Array(
              firmwareData,
              bytesWritten,
              currentChunkSize
            );

            const currentProgress = Math.round(
              ((bytesWritten + currentChunkSize / 2) / totalBytes) * 50
            ); // Scale progress 0-50%
            setProgress(currentProgress);
            setFlashStatus(`Writing flash... ${currentProgress}%`);

            writeError = await writeFlash(
              writer,
              reader,
              currentAddress,
              chunk
            );
            if (writeError) {
              setFlashError(
                `Error writing flash at address ${currentAddress.toString(
                  16
                )}: ${writeError}`
              );
              return;
            }

            bytesWritten += currentChunkSize;
            currentAddress += currentChunkSize;
          }
          setFlashStatus("Wrote flash. Verifying...");
        }

        // Re-enable write protection
        const writeProtectError = await writeProtectAll(writer, reader);
        if (writeProtectError) {
          setFlashError(
            `Error while enabling write protect: ${writeProtectError}`
          );
          return;
        }

        // Re-enter bootloader after reset
        await new Promise((resolve) => setTimeout(resolve, 10));
        bootloaderInitError = await initBootloader(writer, reader);
        if (bootloaderInitError) {
          setFlashError(bootloaderInitError);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));

        const readChunkSize = 256; // Max chunk size for read command
        let bytesVerified = 0;
        let currentReadAddress = CHIP_PARAMETERS.PROGRAM_FLASH_START_ADDRESS;

        while (bytesVerified < totalBytes) {
          const remainingBytes = totalBytes - bytesVerified;
          const currentChunkSize = Math.min(readChunkSize, remainingBytes);

          if (
            currentChunkSize % 4 !== 0 &&
            bytesVerified + currentChunkSize < totalBytes
          ) {
            // This shouldn't happen if write worked correctly and firmware is padded.
            console.warn(
              `Reading chunk size ${currentChunkSize} not multiple of 4 at address ${currentReadAddress.toString(
                16
              )}`
            );
          }
          // Ensure we don't read 0 bytes if totalBytes is multiple of 256
          if (currentChunkSize === 0) break;

          // Progress: 50% -> 100% during verify phase
          const currentProgress =
            50 + Math.round((bytesVerified / totalBytes) * 50);
          setProgress(currentProgress);
          setFlashStatus(`Verifying flash... ${currentProgress}%`);

          const { data: readData, error: readError } = await readFlash(
            writer,
            reader,
            currentReadAddress,
            currentChunkSize
          );

          if (readError) {
            setFlashError(
              `Error reading flash for verification at address ${currentReadAddress.toString(
                16
              )}: ${readError}`
            );
            return;
          }
          if (!readData || readData.length !== currentChunkSize) {
            setFlashError(
              `Verification failed: Incorrect data length received at address 0x${currentReadAddress.toString(
                16
              )}. Expected ${currentChunkSize}, got ${readData?.length ?? 0}.`
            );
            return;
          }

          // Compare read data with original firmware data
          const originalChunk = new Uint8Array(
            firmwareData,
            bytesVerified,
            currentChunkSize
          );
          if (!compareUint8Arrays(readData, originalChunk)) {
            // Find the first differing byte for better error reporting
            let diffIndex = -1;
            for (let i = 0; i < currentChunkSize; i++) {
              if (readData[i] !== originalChunk[i]) {
                diffIndex = i;
                break;
              }
            }
            const diffAddress = currentReadAddress + diffIndex;
            setFlashError(
              `Verification failed: Data mismatch at address 0x${diffAddress.toString(
                16
              )}. Expected 0x${originalChunk[diffIndex]?.toString(
                16
              )}, got 0x${readData[diffIndex]?.toString(16)}.`
            );
            return;
          }

          bytesVerified += currentChunkSize;
          currentReadAddress += currentChunkSize;
        }

        // If verification loop completes without error:
        setProgress(100);
        setFlashStatus("Verification successful. Resetting device...");

        // Finally, clear Boot0 and reset to start the application
        await port.setSignals({ dataTerminalReady: true, requestToSend: true });
        await new Promise((resolve) => setTimeout(resolve, 50)); // Short delay
        await port.setSignals({
          dataTerminalReady: true,
          requestToSend: false,
        });
        setFlashStatus("Device reset. Flash complete.");
      } catch (error) {
        console.error("Firmware flashing failed:", error);
        setFlashError(
          error instanceof Error
            ? error.message
            : "An unknown error occurred during flashing."
        );
        // Ensure progress doesn't misleadingly show 100% on error
        if (progress < 100) setProgress(progress);
        // Attempt to reset device even on error
        try {
          await port.setSignals({
            dataTerminalReady: true,
            requestToSend: true,
          });
          await new Promise((resolve) => setTimeout(resolve, 50));
          await port.setSignals({
            dataTerminalReady: true,
            requestToSend: false,
          });
        } catch (resetError) {
          console.warn("Could not reset device after flash error:", resetError);
        }
      } finally {
        // Ensure locks are always released
        if (reader) {
          try {
            reader.cancel();
            reader.releaseLock();
          } catch (e) {
            console.error("Error releasing reader lock:", e);
          }
        }
        if (writer) {
          try {
            await writer.close();
            writer.releaseLock();
          } catch (e) {
            console.error("Error releasing writer lock:", e);
          }
        }
        setIsFlashing(false);
      }
    },
    [port, isFlashing, progress]
  );

  return {
    isFlashing,
    progress,
    flashStatus,
    flashError,
    startFlashing,
  };
}
