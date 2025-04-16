export const BOOTLOADER_PROTOCOL = {
  ACK: 0x79,
  NACK: 0x1f,
  INIT: 0x7f,
};

export const CHIP_PARAMETERS = {
  PRODUCT_ID: 0x417,
  FLASH_PAGE_SIZE: 1024,
  PROGRAM_FLASH_SIZE: 65536,
  PROGRAM_FLASH_START_ADDRESS: 0x8000000,
  NUM_SECTORS: 65536 / 4096,
};

function createCommand(command: number): Uint8Array {
  return new Uint8Array([command, command ^ 0xff]);
}

export const COMMANDS = {
  GET: createCommand(0x0),
  GET_VERSION: createCommand(0x1),
  GET_ID: createCommand(0x2),
  READ_MEMORY: createCommand(0x11),
  WRITE_MEMORY: createCommand(0x31),
  ERASE_EXTENDED: createCommand(0x44),
  WRITE_PROTECT: createCommand(0x63),
  WRITE_UNPROTECT: createCommand(0x73),
};
