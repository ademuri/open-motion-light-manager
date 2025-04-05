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
      try {
        const result = await communicateWithSerialPort(port, request);
        setResponse(result.response);
        setError(result.error);
      } catch (err) {
        setError(`Uncaught error: ${String(err)}`);
        console.log(err);
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
    error = "port is null";
    return { response, error };
  }

  const writer = port.writable?.getWriter();
  if (!writer) {
    error = "Port not writable";
    return { response, error };
  }
  console.log(`request: ${SerialRequest.toJsonString(request)}`);
  const requestData = SerialRequest.toBinary(request);
  if (requestData.length & 0x80) {
    return { response, error: "Request too long, varint not implemented" };
  }
  const length = requestData.length;
  const requestDataWithLength = new Uint8Array(length + 1);
  console.log(`request length: ${length}`);
  requestDataWithLength[0] = length;
  if (length > 0) {
    requestDataWithLength.set(requestData, 1);
  }

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

    if (data[0] & 0x80) {
      error = "Data too long - varint not implemented";
      return { response, error };
    }

    if (data[0] != data.length - 1) {
      error = `Data length ${data.length - 1} does not match expected length ${
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

  console.log(SerialResponse.toJsonString(response));

  return { response, error };
}
