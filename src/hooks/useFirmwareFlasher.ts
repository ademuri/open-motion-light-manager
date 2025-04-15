import { useState, useCallback } from "react";

interface FirmwareFlasherResult {
  isFlashing: boolean;
  progress: number; // Percentage 0-100
  flashStatus: string | null;
  flashError: string | null;
  startFlashing: (firmwareData: ArrayBuffer) => Promise<void>;
}

/**
 * Writes data to the serial port and reads back the response.
 * Assumes the caller manages acquiring/releasing the reader/writer locks.
 * Reads data until a timeout occurs after the last received byte, indicating the end of the response.
 *
 * @param writer The WritableStreamDefaultWriter for the serial port.
 * @param reader The ReadableStreamDefaultReader for the serial port.
 * @param dataToWrite The Uint8Array data to send.
 * @param interByteTimeoutMs The maximum time allowed between received bytes/chunks before considering the response complete.
 * @returns A promise resolving to an object containing the received data or an error message.
 */
async function writeAndReadSerial(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  dataToWrite: Uint8Array,
  interByteTimeoutMs: number = 1000 // Default timeout between bytes/chunks
): Promise<{ data: Uint8Array | null; error: string | null }> {
  let receivedData = new Uint8Array(0);
  let error: string | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let resolveReadLoop: () => void = () => {}; // Initialize with a no-op function

  // Promise to signal completion of the read loop (either by timeout or stream closing)
  const readLoopComplete = new Promise<void>((resolve) => {
    resolveReadLoop = resolve;
  });

  const resetTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      // console.log(`Read timeout after ${interByteTimeoutMs}ms`); // Debug log
      resolveReadLoop(); // Signal completion due to timeout
    }, interByteTimeoutMs);
  };

  try {
    // --- Writing ---
    await writer.write(dataToWrite);
    console.log("Data written:", dataToWrite); // Debug log
    await new Promise((resolve) => setTimeout(resolve, 10));

    // --- Reading ---
    // Start the read loop asynchronously
    const readLoopPromise = (async () => {
      resetTimeout(); // Start the first timeout immediately after writing
      while (true) {
        try {
          const { value, done } = await reader.read();

          if (done && receivedData.length !== 0) {
            console.log("Reader stream closed."); // Debug log
            resolveReadLoop(); // Stream closed, reading is done
            break;
          }

          if (value) {
            // console.log("Received chunk:", value); // Debug log
            const newData = new Uint8Array(receivedData.length + value.length);
            newData.set(receivedData, 0);
            newData.set(value, receivedData.length);
            receivedData = newData;
            resetTimeout(); // Reset timeout because we received data
          }
          // If value is null/empty, loop continues waiting for next read()
        } catch (readError) {
          // console.error("Error during reader.read():", readError); // Debug log
          error = `Read error: ${readError}`;
          resolveReadLoop(); // Error occurred, reading is done
          break;
        }
      }
    })();

    // Wait for the read loop to complete (timeout or stream close/error)
    await readLoopComplete;
  } catch (writeError) {
    // console.error("Error during writer.write():", writeError); // Debug log
    error = `Write error: ${writeError}`;
  } finally {
    // Clear any pending timeout
    if (timeoutId) clearTimeout(timeoutId);
    // IMPORTANT: Do NOT release locks here. The caller is responsible.
  }

  console.log("Final received data:", receivedData); // Debug log
  console.log("Final error:", error); // Debug log

  if (error) {
    return { data: null, error: error };
  } else {
    // Return received data (can be empty if nothing was received but no error occurred)
    return { data: receivedData, error: null };
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
        await new Promise((resolve) => setTimeout(resolve, 100));
        await port.setSignals({
          dataTerminalReady: false,
          requestToSend: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        await port.setSignals({
          dataTerminalReady: false,
          requestToSend: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const { data: bootloaderInitResponse, error: initError } =
          await writeAndReadSerial(writer, reader, bootloaderInit);

        if (initError) {
          throw new Error(`Bootloader init failed: ${initError}`);
        }
        if (!bootloaderInitResponse || bootloaderInitResponse.length === 0) {
          throw new Error("No response from bootloader initialization.");
        }

        // Check the actual response byte(s) - typically 0x79 (ACK) or 0x1F (NACK)
        const ack = 0x79;
        // const nack = 0x1F; // Correct NACK value per AN2606
        if (bootloaderInitResponse[0] !== ack) {
          const responseHex = Array.from(bootloaderInitResponse)
            .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
            .join(" ");
          throw new Error(`Bootloader did not ACK. Received: ${responseHex}`);
        }

        console.log("Bootloader ACK received.");
        setFlashStatus("Bootloader acknowledged.");
        await new Promise((resolve) => setTimeout(resolve, 50));

        const { data, error } = await writeAndReadSerial(
          writer,
          reader,
          bootloaderCommandGet,
          1000
        );
        if (error) {
          throw new Error(`Error while getting bootloader info: ${error}`);
        }
        if (!data || data.length === 0) {
          throw new Error("Got no data when getting chip product ID");
        }
        console.log(
          "Chip product ID: ",
          Array.from(data)
            .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
            .join(" ")
        );

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
