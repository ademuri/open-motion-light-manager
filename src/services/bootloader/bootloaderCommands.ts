import { readSerial, writeAndReadSerial } from "./serialCommunication";
import { BOOTLOADER_PROTOCOL, CHIP_PARAMETERS, COMMANDS } from "./constants";

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

export async function getVersion(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<{ version: number | null; error: string | null }> {
  const { data, error } = await writeAndReadSerial(
    writer,
    reader,
    COMMANDS.GET_VERSION
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
  if (data[4] !== BOOTLOADER_PROTOCOL.ACK) {
    const errorMessage = "GetVersion response did not end with ACK";
    console.error(errorMessage, data);
    return { version: null, error: errorMessage };
  }

  return { version: data[1], error: null };
}

export async function writeUnprotectAll(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string | null> {
  const { data: commandData, error: commandError } = await writeAndReadSerial(
    writer,
    reader,
    COMMANDS.WRITE_UNPROTECT,
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
  if (commandData[0] !== BOOTLOADER_PROTOCOL.ACK) {
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
  if (ackData[0] !== BOOTLOADER_PROTOCOL.ACK) {
    const errorMessage = "Write unprotect ack not ACKed";
    console.error(errorMessage, ackData);
    return errorMessage;
  }

  return null;
}

export async function eraseAllFlash(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string | null> {
  // Flow is: write erase command, wait for ACK, write number of pages to be erased + checksum.
  const { data: commandData, error: commandError } = await writeAndReadSerial(
    writer,
    reader,
    COMMANDS.ERASE_EXTENDED,
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
  if (commandData[0] !== BOOTLOADER_PROTOCOL.ACK) {
    const errorMessage = "Erase command not ACKed";
    console.error(errorMessage, commandData);
    return errorMessage;
  }
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Note: "0" means 1 page
  const numPages =
    Math.ceil(
      CHIP_PARAMETERS.PROGRAM_FLASH_SIZE / CHIP_PARAMETERS.FLASH_PAGE_SIZE
    ) - 1;
  const pageData = [numPages >> 8, numPages];
  for (let n = 0; n <= numPages; n++) {
    pageData.push(n >> 8, n);
  }

  const { data: numPagesData, error: numPagesError } = await writeAndReadSerial(
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
  if (numPagesData[0] != BOOTLOADER_PROTOCOL.ACK) {
    console.error("Erase command not ACKed", numPagesData[0].toString(16));
    return "Erase command not ACKed";
  }

  return null;
}
