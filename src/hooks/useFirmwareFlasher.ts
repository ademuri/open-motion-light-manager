import { useState, useCallback } from "react";
import {
  initBootloader,
  getProductId,
  CHIP_PARAMETERS,
  writeUnprotectAll,
  eraseAllFlash,
  getVersion,
} from "../services/bootloader";

interface FirmwareFlasherResult {
  isFlashing: boolean;
  progress: number; // Percentage 0-100
  flashStatus: string | null;
  flashError: string | null;
  startFlashing: (firmwareData: ArrayBuffer) => Promise<void>;
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

        const {version: version, error: versionError} = await getVersion(writer, reader);
        if (versionError) {
          setFlashError(`Error while getting product ID: ${versionError}`);
          return;
        }
        console.log(`Bootloader version: ${version}`);

        await new Promise((resolve) => setTimeout(resolve, 10));
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
        console.log("Checking getProductId");
        console.log(await getProductId(writer, reader));

        await new Promise((resolve) => setTimeout(resolve, 10));
        setFlashStatus("Erasing flash...");
        const eraseError = await eraseAllFlash(writer, reader);
        if (eraseError) {
          setFlashError(`Error while erasing flash: ${eraseError}`);
          return;
        }
        setFlashStatus("Erased flash");

        // --- Placeholder for actual flashing logic ---
        // This part would involve sending commands like GetID, Erase, Write Memory, Go
        // Each step would likely use writeAndReadSerial again, checking responses.
        // Example (conceptual):
        // const getIdCommand = ...;
        // const { data: idResponse, error: idError } = await writeAndReadSerial(writer, reader, getIdCommand);
        // ... process idResponse ...
        // const eraseCommand = ...;
        // const { data: eraseResponse, error: eraseError } = await writeAndReadSerial(writer, reader, eraseCommand);
        // ... process eraseResponse ...
        // ... loop for writing firmwareData in chunks using writer.write() and checking ACK ...
        // const goCommand = ...;
        // await writer.write(goCommand); // Go command might not have a response to read

        // --- End Placeholder ---

        // Simulate successful flashing process for now
        // await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate work
        // setFlashStatus("Firmware flash successful!");
        // setProgress(100);

        // Finally, clear Boot0 and reset to start the application
        // await port.setSignals({ dataTerminalReady: true, requestToSend: true });
        // await new Promise((resolve) => setTimeout(resolve, 50)); // Short delay
        // await port.setSignals({
        //   dataTerminalReady: true,
        //   requestToSend: false,
        // });
        // setFlashStatus("Device reset. Flash complete.");
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
            // reader.cancel(); // Optionally cancel pending reads
            reader.releaseLock();
          } catch (e) {
            console.error("Error releasing reader lock:", e);
          }
        }
        if (writer) {
          try {
            // await writer.close(); // Don't close, just release lock
            writer.releaseLock();
          } catch (e) {
            console.error("Error releasing writer lock:", e);
          }
        }
        setIsFlashing(false);
      }
    },
    [port, isFlashing, progress] // Added progress to dependencies to avoid stale closure issue in error handling
  );

  return {
    isFlashing,
    progress,
    flashStatus,
    flashError,
    startFlashing,
  };
}
