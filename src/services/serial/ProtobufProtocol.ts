import { SerialRequest, SerialResponse } from "../../../proto_out/serial.ts";
import { SerialTransport } from "./SerialTransport";
import { ProtocolError } from "./errors";

export class ProtobufProtocol {
  constructor(private transport: SerialTransport) {}

  async sendRequest(request: SerialRequest, signal?: AbortSignal): Promise<SerialResponse> {
    const requestData = SerialRequest.toBinary(request);

    if (requestData.length > 127) {
      throw new ProtocolError("Request too long (max 127 bytes)");
    }

    const dataWithLength = new Uint8Array(requestData.length + 1);
    dataWithLength[0] = requestData.length;
    dataWithLength.set(requestData, 1);

    await this.transport.write(dataWithLength);

    // Read response length
    const lengthByte = await this.transport.readExact(1, { timeout: 1000, signal });
    const responseLength = lengthByte[0];

    if (responseLength > 127) {
        throw new ProtocolError("Response too long (max 127 bytes)");
    }

    if (responseLength === 0) {
        // Handle empty response if applicable
        return SerialResponse.fromBinary(new Uint8Array(0));
    }

    const responseData = await this.transport.readExact(responseLength, { timeout: 1000, signal });
    return SerialResponse.fromBinary(responseData);
  }
}
