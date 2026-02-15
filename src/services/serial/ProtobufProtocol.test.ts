import { describe, it, expect, vi } from "vitest";
import { ProtobufProtocol } from "./ProtobufProtocol";
import { SerialRequest, SerialResponse } from "../../../proto_out/serial";

describe("ProtobufProtocol", () => {
  it("should send a request and parse a response", async () => {
    const mockTransport = {
      write: vi.fn().mockResolvedValue(undefined),
      readExact: vi.fn()
    } as any;

    const protocol = new ProtobufProtocol(mockTransport);
    
    const request = SerialRequest.create({
        getDeviceConfig: {}
    });
    
    const response = SerialResponse.create({
        deviceConfig: {
            brightness: 50,
            motionSensitivity: 10,
            onDuration: 30
        }
    });
    const responseBinary = SerialResponse.toBinary(response);
    
    mockTransport.readExact
      .mockResolvedValueOnce(new Uint8Array([responseBinary.length]))
      .mockResolvedValueOnce(responseBinary);

    const result = await protocol.sendRequest(request);
    
    expect(mockTransport.write).toHaveBeenCalled();
    const writtenData = mockTransport.write.mock.calls[0][0];
    expect(writtenData[0]).toBe(writtenData.length - 1); // Length prefix
    
    expect(result).toEqual(response);
  });

  it("should throw error if response is too long", async () => {
    const mockTransport = {
      write: vi.fn().mockResolvedValue(undefined),
      readExact: vi.fn().mockResolvedValue(new Uint8Array([129])),
    } as any;

    const protocol = new ProtobufProtocol(mockTransport);
    await expect(protocol.sendRequest({} as any)).rejects.toThrow("Response too long");
  });
});
