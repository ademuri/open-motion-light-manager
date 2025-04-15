import { useState, useCallback } from "react";

interface FirmwareFlasherResult {
  isFlashing: boolean;
  progress: number; // Percentage 0-100
  flashStatus: string | null;
  flashError: string | null;
  startFlashing: (firmwareData: ArrayBuffer) => Promise<void>;
}

const BOOTLOADER_ACK = 0x79;
const BOOTLOADER_NACK = 0x1f;
const BOOTLOADER_PRODUCT_ID = 0x417;
const FLASH_PAGE_SIZE = 1024;
const PROGRAM_FLASH_SIZE = 65536;

async function readSerial(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeout: number = 100, // Default timeout
  loop: boolean = false
): Promise<{ data: Uint8Array | null; error: string | null }> {
  try {
    const startTime = Date.now();
    let receivedData = new Uint8Array(0);

    console.log("Beginning read loop");
    do {
      const { value, done } = await reader.read();
      if (value) {
        console.log("Read", value);
      }

      if (done) {
        console.log("Serial done");
        break;
      }

      if (value && value.length > 0) {
        const newData = new Uint8Array(receivedData.length + value.length);
        newData.set(receivedData, 0);
        newData.set(value, receivedData.length);
        receivedData = newData;
      }

      // If we've received an ACK, we're probably done.
      if (
        receivedData.length > 0 &&
        (receivedData[receivedData.length - 1] === BOOTLOADER_ACK ||
          receivedData[receivedData.length - 1] === BOOTLOADER_NACK)
      ) {
        break;
      }
    } while (loop && Date.now() - startTime < timeout);

    if (receivedData.length === 0) {
      return { data: null, error: "No data received within timeout" };
    }

    return { data: receivedData, error: null };
  } catch (e) {
    console.log("Error while reading from serial", e);
    return { data: null, error: String(e) };
  }
}

/**
 * Writes data to the serial port and reads back the response.
 * Assumes the caller manages acquiring/releasing the reader/writer locks.
 * Reads data until a timeout occurs or the reader indicates done and the last byte is an ACK.
 *
 * @param writer The WritableStreamDefaultWriter for the serial port.
 * @param reader The ReadableStreamDefaultReader for the serial port.
 * @param dataToWrite The Uint8Array data to send.
 * @param timeout The maximum time allowed for the whole operation.
 * @returns A promise resolving to an object containing the received data or an error message.
 */
async function writeAndReadSerial(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  dataToWrite: Uint8Array,
  timeout: number = 100, // Default timeout
  readLoop: boolean = true
): Promise<{ data: Uint8Array | null; error: string | null }> {
  try {
    console.log("Writing data", dataToWrite);
    await writer.write(dataToWrite);
    console.log("Wrote data");

    return readSerial(reader, timeout, readLoop);
  } catch (e) {
    console.log("Communication error", e);
    let errorMessage;
    if (e instanceof Error) {
      errorMessage = `Communication error: ${e.message}`;
    } else {
      // Handle cases where 'e' might not be an Error object (e.g., a string)
      errorMessage = `Communication error: ${String(e)}`;
    }
    return { data: null, error: errorMessage };
  }
}

export function useFirmwareFlasher(
  port: SerialPort | null
): FirmwareFlasherResult {
  const [isFlashing, setIsFlashing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flashStatus, setFlashStatus] = useState<string | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);

  // Per AN2606
  const bootloaderInit = new Uint8Array([0x7f]);

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

  const bootloaderCommandGet = createCommand(0x0);
  const bootloaderCommandGetVersion = createCommand(0x1);
  const bootloaderCommandGetId = createCommand(0x2);
  const bootloaderCommandReadMemory = createCommand(0x11);
  const bootloaderCommandWriteMemory = createCommand(0x31);
  const bootloaderCommandErase = createCommand(0x43);
  const bootloaderCommandEraseExtended = createCommand(0x44);
  const bootloaderCommandWriteUnprotect = createCommand(0x73);

  async function initBootloader(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<string | null> {
    const { data: bootloaderInitResponse, error: initError } =
      await writeAndReadSerial(writer, reader, bootloaderInit);

    if (initError) {
      return `Bootloader init failed: ${initError}`;
    }
    if (!bootloaderInitResponse || bootloaderInitResponse.length === 0) {
      return "No response from bootloader initialization.";
    }

    if (bootloaderInitResponse[0] !== BOOTLOADER_ACK) {
      const responseHex = Array.from(bootloaderInitResponse)
        .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
        .join(" ");
      return `Bootloader did not ACK. Received: ${responseHex}`;
    }

    return null;
  }

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

  async function getProductId(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<{ id: number | null; error: string | null }> {
    const { data, error } = await writeAndReadSerial(
      writer,
      reader,
      bootloaderCommandGetId
    );
    if (error) {
      return { id: null, error: error };
    }
    if (!data || data.length === 0) {
      return { id: null, error: "Got no data when getting chip product ID" };
    }
    if (data.length !== 5) {
      console.error(
        `Got incorrect number of bytes for GetId. Expected 5, got ${data.length}: ${data}`
      );
      return { id: null, error: "Got incorrect number of bytes for GetId" };
    }
    if (data[4] !== BOOTLOADER_ACK) {
      const errorMessage = "GetId response did not end with ACK";
      console.error(errorMessage, data);
      return { id: null, error: errorMessage };
    }

    const id = (data[2] << 8) | data[3];
    return { id, error: null };
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
    console.log("Wrote write unprotect command");
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
    console.log("begin eraseAllFlash");
    // Flow is: write erase command, wait for ACK, write number of pages to be erased + checksum.
    const { data: commandData, error: commandError } = await writeAndReadSerial(
      writer,
      reader,
      bootloaderCommandEraseExtended,
      100,
      false
    );
    console.log("Wrote erase command");
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

    console.log("Writing all pages to be erased");
    const numPages = Math.ceil(PROGRAM_FLASH_SIZE / FLASH_PAGE_SIZE);
    let pageData = new Uint8Array([numPages, numPages ^ 0xff]);
    
    const { data: numPagesData, error: numPagesError } =
      await writeAndReadSerial(
        writer,
        reader,
        // All pages
        appendChecksum(new Uint8Array([0, 0, 0, 0])),
        10000,
        false
      );
    console.log("Got response");
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
      console.log("Erase command not ACKed", numPagesData[0].toString(16));
      return "Erase command not ACKed";
    }
    console.log("eraseAllPages success");

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
