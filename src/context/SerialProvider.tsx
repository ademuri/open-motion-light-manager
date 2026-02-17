import React, { useMemo } from "react";
import { SerialService } from "../services/serial/SerialService";
import { SerialContext } from "./SerialContext";

export function SerialProvider({ port, children }: { port: SerialPort | null; children: React.ReactNode }) {
  const service = useMemo(() => (port ? new SerialService(port) : null), [port]);
  const value = useMemo(() => ({ port, service }), [port, service]);
  return <SerialContext.Provider value={value}>{children}</SerialContext.Provider>;
}
