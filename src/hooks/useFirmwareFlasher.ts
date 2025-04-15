import { useState, useCallback } from "react";
import {
  readSerial,
  writeAndReadSerial,
  initBootloader,
  getProductId,
} from "../services/bootloader";

interface FirmwareFlasherResult {
  isFlashing: boolean;
  progress: number; // Percentage 0-100
  flashStatus: string | null;
  flashError: string | null;
  startFlashing: (firmwareData: ArrayBuffer) => Promise<void>;
}

const BOOTLOADER_ACK = 0x79;
const BOOTLOADER_PRODUCT_ID = 0x417;
const FLASH_PAGE_SIZE = 1024;
const PROGRAM_FLASH_SIZE = 65536;

export function useFirmwareFlasher(
  port: SerialPort | null
): FirmwareFlasherResult {
  const [isFlashing, setIsFlashing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flashStatus, setFlashStatus] = useState<string | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);

  function appendChecksum(data: Uint8Array): Uint8Array {
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum = checksum ^ data[i];
    }
    const result = new Uint8Array(data.length + 1);
    result.set(data, 0);
    result.set([checksum], data.length);
    return result;
  }

  function createCommand(command: number): Uint8Array {
    return new Uint8Array([command, command ^ 0xff]);
  }

  const bootloaderCommandGetVersion = createCommand(0x1);
  const bootloaderCommandEraseExtended = createCommand(0x44);
  const bootloaderCommandWriteUnprotect = createCommand(0x73);

  async function getVersion(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<{ version: number | null; error: string | null }> {
    const { data, error } = await writeAndReadSerial(
      writer,
      reader,
      bootloaderCommandGetVersion
    );
    if (error) {
      return { version: null, error: error };
    }
    if (!data || data.length === 0) {
      return {
        version: null,
        error: "Got no data when getting chip product version",
      };
    }
    if (data.length !== 5) {
      console.error(
        `Got incorrect number of bytes for GetVersion. Expected 5, got ${data.length}: ${data}`
      );
      return {
        version: null,
        error: "Got incorrect number of bytes for GetVersion",
      };
    }
    if (data[4] !== BOOTLOADER_ACK) {
      const errorMessage = "GetVersion response did not end with ACK";
      console.error(errorMessage, data);
      return { version: null, error: errorMessage };
    }

    return { version: data[1], error: null };
  }

  async function writeUnprotectAll(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<string | null> {
    const { data: commandData, error: commandError } = await writeAndReadSerial(
      writer,
      reader,
      bootloaderCommandWriteUnprotect,
      100,
      false
    );
    if (commandError) {
      return commandError;
    }
    if (!commandData || commandData.length === 0) {
      return "Got no response when write unprotecting flash";
    }
    if (commandData.length !== 1) {
      console.error(
        `Got incorrect number of bytes for write unprotect. Expected 1, got ${commandData.length}: ${commandData}`
      );
      return "Got incorrect number of bytes for write unprotect command";
    }
    if (commandData[0] !== BOOTLOADER_ACK) {
      const errorMessage = "Write unprotect command not ACKed";
      console.error(errorMessage, commandData);
      return errorMessage;
    }

    const { data: ackData, error: ackError } = await readSerial(
      reader,
      100,
      false
    );
    if (ackError) {
      return ackError;
    }
    if (!ackData || ackData.length === 0) {
      return "Got no response when write unprotecting flash";
    }
    if (ackData.length !== 1) {
      console.error(
        `Got incorrect number of bytes for write unprotect. Expected 1, got ${ackData.length}: ${ackData}`
      );
      return "Got incorrect number of bytes for write unprotect ack";
    }
    if (ackData[0] !== BOOTLOADER_ACK) {
      const errorMessage = "Write unprotect ack not ACKed";
      console.error(errorMessage, ackData);
      return errorMessage;
    }

    return null;
  }

  async function eraseAllFlash(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<string | null> {
    // Flow is: write erase command, wait for ACK, write number of pages to be erased + checksum.
    const { data: commandData, error: commandError } = await writeAndReadSerial(
      writer,
      reader,
      bootloaderCommandEraseExtended,
      100,
      false
    );
    if (commandError) {
      return commandError;
    }
    if (!commandData || commandData.length === 0) {
      return "Got no response when erasing flash";
    }
    if (commandData.length !== 1) {
      console.error(
        `Got incorrect number of bytes for erase. Expected 1, got ${commandData.length}: ${commandData}`
      );
      return "Got incorrect number of bytes for erase command";
    }
    if (commandData[0] !== BOOTLOADER_ACK) {
      const errorMessage = "Erase command not ACKed";
      console.error(errorMessage, commandData);
      return errorMessage;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Note: "0" means 1 page
    const numPages = Math.ceil(PROGRAM_FLASH_SIZE / FLASH_PAGE_SIZE) - 1;
    const pageData = [numPages >> 8, numPages];
    for (let n = 0; n <= numPages; n++) {
      pageData.push(n >> 8, n);
    }

    const { data: numPagesData, error: numPagesError } =
      await writeAndReadSerial(
        writer,
        reader,
        // All pages
        appendChecksum(new Uint8Array(pageData)),
        10000,
        false
      );
    if (numPagesError) {
      return commandError;
    }
    if (!numPagesData || numPagesData.length === 0) {
      return "Got no response when erasing flash";
    }
    if (numPagesData.length !== 1) {
      console.error(
        `Got incorrect number of bytes for erase. Expected 1, got ${numPagesData.length}: ${numPagesData}`
      );
      return "Got incorrect number of bytes for erase command";
    }
    if (numPagesData[0] != BOOTLOADER_ACK) {
      console.error("Erase command not ACKed", numPagesData[0].toString(16));
      return "Erase command not ACKed";
    }

    return null;
  }

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
        if (productId !== BOOTLOADER_PRODUCT_ID) {
          setFlashError(
            `Got incorrect product ID: ${productId} instead of ${BOOTLOADER_PRODUCT_ID}`
          );
          return;
        }
        setFlashStatus("Confirmed chip product ID");

        // const {version: version, error: versionError} = await getVersion(writer, reader);
        // if (versionError) {
        //   setFlashError(`Error while getting product ID: ${versionError}`);
        //   return;
        // }
        // console.log(`Bootloader version: ${version}`);

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
