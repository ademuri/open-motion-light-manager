export class SerialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SerialError";
  }
}

export class TimeoutError extends SerialError {
  constructor(message: string = "Serial operation timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export class ChecksumError extends SerialError {
  constructor(message: string = "Checksum verification failed") {
    super(message);
    this.name = "ChecksumError";
  }
}

export class ConnectionError extends SerialError {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

export class ProtocolError extends SerialError {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}
