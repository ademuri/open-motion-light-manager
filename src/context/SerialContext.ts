import { createContext } from "react";
import { SerialService } from "../services/serial/SerialService";

export const SerialContext = createContext<{ port: SerialPort | null; service: SerialService | null }>({
  port: null,
  service: null,
});
