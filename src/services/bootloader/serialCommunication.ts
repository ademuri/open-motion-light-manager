import { SerialResult } from "./types";
import { BOOTLOADER_PROTOCOL } from "./constants.ts";

export async function readSerial(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeout: number = 100, // Default timeout
  loop: boolean = false,
  expectedResponseSize: number = -1,
): Promise<SerialResult> {
  try {
    const startTime = Date.now();
    let receivedData = new Uint8Array(0);

    // console.log("Beginning read loop");
    do {
      // console.log("Reading...");
      const { value, done } = await reader.read();
      // if (value) {
      //   console.log("Read", value);
      // }

      if (done) {
        // console.log("Serial done");
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
        expectedResponseSize <= 0 &&
        (receivedData[receivedData.length - 1] === BOOTLOADER_PROTOCOL.ACK ||
          receivedData[receivedData.length - 1] === BOOTLOADER_PROTOCOL.NACK)
      ) {
        break;
      }

      // Or, if we've received the expected amount of data, we're done.
      if (expectedResponseSize > 0 && receivedData.length >= expectedResponseSize) {
        break;
      }
    } while (loop && Date.now() - startTime < timeout);

    if (receivedData.length === 0) {
      return { data: null, error: "No data received within timeout" };
    }

    return { data: receivedData, error: null };
  } catch (e) {
    console.error("Error while reading from serial", e);
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
export async function writeAndReadSerial(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  dataToWrite: Uint8Array,
  timeout: number = 100, // Default timeout
  readLoop: boolean = true,
  expectedResponseSize: number = -1,
): Promise<SerialResult> {
  try {
    await writer.write(dataToWrite);

    return readSerial(reader, timeout, readLoop, expectedResponseSize);
  } catch (e) {
    console.error("Communication error", e);
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
