import { useCallback, useState } from "react";
import { SerialRequest, SerialResponse } from "../../proto_out/serial.ts";

export function useSerialCommunication(port: SerialPort | null) {
  const [response, setResponse] = useState<SerialResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sendRequest = useCallback(
    async (request: SerialRequest) => {
      if (!port) return;

      setLoading(true);
      setError(""); // Clear previous errors
      setResponse(null); // Clear previous response
      try {
        const result = await communicateWithSerialPort(port, request);
        setResponse(result.response);
        setError(result.error);
      } catch (err) {
        setError(`Uncaught error during communication: ${String(err)}`);
        console.error("Uncaught error in sendRequest:", err);
      } finally {
        setLoading(false);
      }
    },
    [port]
  );

  return { response, error, loading, sendRequest };
}

// Given an open serial port, writes out the request and reads back the response.
async function communicateWithSerialPort(
  port: SerialPort | null,
  request: SerialRequest
): Promise<{ response: SerialResponse | null; error: string }> {
  let response: SerialResponse | null = null;
  let error = "";

  if (port === null) {
    return { response, error: "port is null" };
  }
  if (!port.writable) {
    return { response, error: "Port is not writable (might be closed)" };
  }
  if (!port.readable) {
    return { response, error: "Port is not readable (might be closed)" };
  }

  // --- Writing ---
  const writer = port.writable.getWriter();
  try {
    // console.log(`request: ${SerialRequest.toJsonString(request)}`);
    const requestData = SerialRequest.toBinary(request);

    // Basic check for length encoding (assuming simple single byte for now)
    if (requestData.length > 127) {
      // 0x7F, as 0x80 is the varint marker bit
      writer.releaseLock(); // Release lock before returning
      return {
        response,
        error: "Request too long, simple length encoding limit is 127 bytes",
      };
    }

    const length = requestData.length;
    const requestDataWithLength = new Uint8Array(length + 1);
    requestDataWithLength[0] = length;
    if (length > 0) {
      requestDataWithLength.set(requestData, 1);
    }

    // console.log(
    //   `Sending data bytes (hex): ${Array.from(requestDataWithLength)
    //     .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
    //     .join(" ")}`
    // );
    await writer.write(requestDataWithLength);
  } catch (writeError) {
    error = "Error writing to port: " + writeError;
    return { response, error };
  } finally {
    if (writer) {
      try {
        writer.releaseLock();
      } catch (lockError) {
        console.error("Error releasing writer lock in finally:", lockError);
        // Avoid overwriting a potential read error later
        if (!error) error = "Error releasing writer lock: " + lockError;
      }
    }
  }

  // --- Reading ---
  const reader = port.readable.getReader();
  let receivedDataBuffer = new Uint8Array(0); // Buffer to accumulate chunks
  let expectedTotalLength = -1; // Expected total bytes including length byte

  try {
    while (true) {
      // Loop until we have the expected data or an error occurs
      const { value, done } = await reader.read();

      if (done) {
        error = "Reader stream closed unexpectedly.";
        // No more data can be read, break the loop
        break;
      }

      if (value && value.length > 0) {
        // Append new data chunk to our buffer
        const newData = new Uint8Array(
          receivedDataBuffer.length + value.length
        );
        newData.set(receivedDataBuffer, 0);
        newData.set(value, receivedDataBuffer.length);
        receivedDataBuffer = newData;

        // If we haven't determined the expected length yet, do it now.
        if (expectedTotalLength === -1 && receivedDataBuffer.length >= 1) {
          const lengthByte = receivedDataBuffer[0];
          if (lengthByte > 127) {
            error =
              "Data too long - varint not implemented for response length";
            break; // Exit loop on error
          }
          expectedTotalLength = lengthByte + 1; // +1 for the length byte itself
        }

        // Check if we have received enough data
        if (
          expectedTotalLength !== -1 &&
          receivedDataBuffer.length >= expectedTotalLength
        ) {
          // We have received at least the expected number of bytes.
          // If we received exactly the right amount, great.
          // If we received more, it might be part of the next message. We'll only process the expected part.
          break; // Exit the read loop
        }
      }
      // If value is empty or null, loop continues waiting for more data or 'done'
    } // End while loop

    // --- Process received data (if no error occurred during reading loop) ---
    if (error === "") {
      if (expectedTotalLength === -1) {
        // This could happen if the stream closed before the first byte arrived
        error = "Failed to read length byte before stream ended.";
      } else if (receivedDataBuffer.length < expectedTotalLength) {
        // This could happen if 'done' was true before enough bytes arrived
        error = `Stream closed before full message received. Expected ${expectedTotalLength} bytes, got ${receivedDataBuffer.length}.`;
      } else {
        // We have enough data. Process the expected part.
        const completeMessageData = receivedDataBuffer.subarray(
          0,
          expectedTotalLength
        );

        // console.log(
        //   `Processing final buffer (hex): ${Array.from(completeMessageData)
        //     .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
        //     .join(" ")}`
        // );

        // Validate the length byte against the actual received payload length *within the processed segment*
        // This check is somewhat redundant due to the loop logic, but good for sanity.
        if (completeMessageData[0] !== completeMessageData.length - 1) {
          error = `Internal inconsistency: Message length byte ${
            completeMessageData[0]
          } does not match processed segment length ${
            completeMessageData.length - 1
          }`;
        } else {
          const dataWithoutLength = completeMessageData.subarray(1);
          try {
            response = SerialResponse.fromBinary(dataWithoutLength);
            // console.log(`Parsed response: ${SerialResponse.toJsonString(response)}`);
          } catch (parseError) {
            error = "Error parsing binary response: " + parseError;
          }
        }
        // Note: If receivedDataBuffer.length > expectedTotalLength, the extra bytes are currently discarded.
        // This should be OK, since the device should only send data on request.
      }
    }
  } catch (e) {
    error = "Error reading from port: " + e;
  } finally {
    // Ensure the reader lock is always released
    if (reader) {
      try {
        reader.releaseLock();
      } catch (lockError) {
        console.error("Error releasing reader lock:", lockError);
        // If an error wasn't already set during reading/processing, set one now.
        if (!error) {
          error = "Error releasing reader lock: " + lockError;
        }
      }
    }
  }

  // Return the result after finally block has executed
  return { response, error };
}
