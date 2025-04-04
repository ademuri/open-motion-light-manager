import { SerialRequest, SerialResponse } from "../../proto_out/serial.ts";

// Given an open serial port, writes out the request and reads back the response.
export async function useSerialPort(
  port: SerialPort | null,
  request: SerialRequest
): Promise<{ response: SerialResponse | null; error: string }> {
  let response: SerialResponse | null = null;
  let error = "";

  if (port === null) {
    error = "port is null";
    return { response, error };
  }

  const writer = port.writable?.getWriter();
  if (!writer) {
    error = "Port not writable";
    return { response, error };
  }
  const requestData = SerialRequest.toBinary(request);
  if (requestData.length & 0x80) {
    return {response, error: "Request too long, varint not implemented"};
  }
  const requestDataWithLength = new Uint8Array(length + 1);
  requestDataWithLength[0] = length;
  requestDataWithLength.set(requestData, 1);

  await writer.write(requestDataWithLength);
  writer.releaseLock();

  const reader = port.readable?.getReader();
  if (!reader) {
    error = "Port not readable";
    return { response, error };
  }

  try {
    const result = await reader.read();
    if (result.done) {
      error = "Reader done before anything read";
      return { response, error };
    }
    const data = result.value;
    if (!data) {
      error = "Failed to read any data";
      return { response, error };
    }
    console.log("Read " + data.length + " bytes");
    const hexString = Array.from(data)
      .map((byte) => {
        if (typeof byte !== "number") {
          console.error("Unexpected non-number byte:", byte);
          return "??";
        }
        return byte.toString(16).padStart(2, "0");
      })
      .join(" ");
    console.log(`Data (hex): ${hexString}`);

    if (data[0] & 0x80) {
      error = "Data too long - varint not implemented";
      return { response, error };
    }

    if (data[0] != data.length - 1) {
      error =
        `Data length ${data.length - 1} does not match expected length ${
          data[0]
        }`;
      return { response, error };
    }

    const dataWithoutLength = data.subarray(1);
    response = SerialResponse.fromBinary(dataWithoutLength);
  } catch (e) {
    error = "Error reading from port: " + e;
    return { response, error };
  } finally {
    reader.releaseLock();
  }

  return { response, error };
}
