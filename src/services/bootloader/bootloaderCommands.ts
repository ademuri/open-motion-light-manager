import { writeAndReadSerial } from "./serialCommunication";
import { BOOTLOADER_PROTOCOL, COMMANDS } from "./constants";

export async function initBootloader(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string | null> {
  const { data: bootloaderInitResponse, error: initError } =
    await writeAndReadSerial(
      writer,
      reader,
      new Uint8Array([BOOTLOADER_PROTOCOL.INIT])
    );

  if (initError) {
    return `Bootloader init failed: ${initError}`;
  }
  if (!bootloaderInitResponse || bootloaderInitResponse.length === 0) {
    return "No response from bootloader initialization.";
  }

  if (bootloaderInitResponse[0] !== BOOTLOADER_PROTOCOL.ACK) {
    const responseHex = Array.from(bootloaderInitResponse)
      .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");
    return `Bootloader did not ACK. Received: ${responseHex}`;
  }

  return null;
}

export async function getProductId(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<{ id: number | null; error: string | null }> {
  const { data, error } = await writeAndReadSerial(
    writer,
    reader,
    COMMANDS.GET_ID
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
  if (data[4] !== BOOTLOADER_PROTOCOL.ACK) {
    const errorMessage = "GetId response did not end with ACK";
    console.error(errorMessage, data);
    return { id: null, error: errorMessage };
  }

  const id = (data[2] << 8) | data[3];
  return { id, error: null };
}
