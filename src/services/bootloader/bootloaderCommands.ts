import { readSerial, writeAndReadSerial } from "./serialCommunication";
import { BOOTLOADER_PROTOCOL, CHIP_PARAMETERS, COMMANDS } from "./constants";
import { SerialResult } from "./types";

// See AN3155: https://www.st.com/resource/en/application_note/an3155-usart-protocol-used-in-the-stm32-bootloader-stmicroelectronics.pdf

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

async function writeAndExpectAck(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  dataToWrite: Uint8Array
): Promise<string | null> {
  const { data: commandData, error: commandError } = await writeAndReadSerial(
    writer,
    reader,
    dataToWrite,
    100,
    false
  );
  if (commandError) {
    return commandError;
  }
  if (!commandData || commandData.length === 0) {
    return "Got no response when writing flash";
  }
  if (commandData.length !== 1) {
    console.error(
      `Got incorrect number of bytes. Expected 1, got ${commandData.length}:`,
      dataToWrite,
      commandData
    );
    return "Got incorrect number of bytes";
  }
  if (commandData[0] !== BOOTLOADER_PROTOCOL.ACK) {
    const errorMessage = "Command not ACKed";
    console.error(errorMessage, dataToWrite, commandData);
    return errorMessage;
  }

  return null;
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
  const error = await writeAndExpectAck(writer, reader, COMMANDS.WRITE_UNPROTECT);
  if (error) {
    return `Error while issuing write unprotect: ${error}`;
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

export async function writeProtectAll(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string | null> {
  const error = await writeAndExpectAck(
    writer,
    reader,
    COMMANDS.WRITE_PROTECT
  );
  if (error) {
    return `Error while issuing write protect: ${error}`;
  }

  const sectorsData = [CHIP_PARAMETERS.NUM_SECTORS - 1];
  for (let i = 0; i < CHIP_PARAMETERS.NUM_SECTORS; i++) {
    sectorsData.push(i);
  }
  const sectorsError = await writeAndExpectAck(
    writer,
    reader,
    appendChecksum(new Uint8Array(sectorsData))
  );
  if (sectorsError) {
    return `Error setting number of sectors for write protect: ${sectorsError}`;
  }

  return null;
}

export async function eraseAllFlash(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string | null> {
  // Flow is: write erase command, wait for ACK, write number of pages to be erased + checksum.
  let error = await writeAndExpectAck(writer, reader, COMMANDS.ERASE_EXTENDED);
  if (error) {
    return `Error while issuing erase: ${error}`;
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

  error = await writeAndExpectAck(
    writer,
    reader,
    // All pages
    appendChecksum(new Uint8Array(pageData))
  );
  if (error) {
    return `Error while setting number of pages to erase: ${error}`;
  }

  return null;
}

export async function writeFlash(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  address: number,
  data: Uint8Array
): Promise<string | null> {
  if (address < 0 || !Number.isInteger(address)) {
    return `Invalid address: ${address}`;
  }
  if (data.length === 0) {
    return "writeFlash called with empty data";
  }
  if (data.length % 4 !== 0) {
    return `writeFlash called with invalid data length: ${data.length}; must be a multiple of 4`;
  }
  if (data.length > 256) {
    return `writeFlash called with invalid data length: ${data.length}; must be <=256`;
  }

  let error = await writeAndExpectAck(writer, reader, COMMANDS.WRITE_MEMORY);
  if (error) {
    return `Error while issuing write: ${error}`;
  }
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Now, send the start address (4 bytes) and checksum
  const startAddress = [
    address >> 24,
    (address >> 16) & 0xff,
    (address >> 8) & 0xff,
    address & 0xff,
  ];
  error = await writeAndExpectAck(
    writer,
    reader,
    appendChecksum(new Uint8Array(startAddress))
  );
  if (error) {
    return `Error while setting write start address: ${error}`;
  }
  await new Promise((resolve) => setTimeout(resolve, 10));

  const dataWithLength = new Uint8Array(data.length + 1);
  dataWithLength[0] = data.length - 1;
  dataWithLength.set(data, 1);

  error = await writeAndExpectAck(
    writer,
    reader,
    appendChecksum(dataWithLength)
  );
  if (error) {
    return `Error while writing flash: ${error}`;
  }

  return null;
}

export async function readFlash(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  address: number,
  numBytes: number
): Promise<SerialResult> {
  if (address < 0 || !Number.isInteger(address)) {
    return { data: null, error: `Invalid address: ${address}` };
  }
  if (numBytes === 0) {
    return { data: null, error: "readFlash called with empty data" };
  }
  if (numBytes % 4 !== 0) {
    return {
      data: null,
      error: `readFlash called with invalid data length: ${numBytes}; must be a multiple of 4`,
    };
  }
  if (numBytes > 256) {
    return {
      data: null,
      error: `readFlash called with invalid data length: ${numBytes}; must be <=256`,
    };
  }

  let error = await writeAndExpectAck(writer, reader, COMMANDS.READ_MEMORY);
  if (error) {
    return { data: null, error: `Error while issuing read: ${error}` };
  }
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Send the start address (4 bytes) and checksum
  const startAddress = [
    address >> 24,
    (address >> 16) & 0xff,
    (address >> 8) & 0xff,
    address & 0xff,
  ];
  error = await writeAndExpectAck(
    writer,
    reader,
    appendChecksum(new Uint8Array(startAddress))
  );
  if (error) {
    return {
      data: null,
      error: `Error while setting read start address: ${error}`,
    };
  }
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Send the number of bytes to be read and checksum
  const { data: data, error: readError } = await writeAndReadSerial(
    writer,
    reader,
    new Uint8Array([numBytes - 1, 0xff ^ (numBytes - 1)]),
    100,
    true,
    numBytes + 1
  );
  if (error) {
    return {
      data: null,
      error: `Error while setting read size: ${error}`,
    };
  }
  if (!data) {
    return {
      data: null,
      error: `Error while setting read size: received no data`,
    };
  }
  if (data[0] != BOOTLOADER_PROTOCOL.ACK) {
    return {
      data: null,
      error: `Error while setting read size: received ${data[0]} instead of ACK (${BOOTLOADER_PROTOCOL.ACK})`,
    };
  }

  return { data: data.subarray(1), error: readError };
}
