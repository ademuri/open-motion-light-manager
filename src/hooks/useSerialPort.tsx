import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { SerialRequest, SerialResponse } from "../../proto_out/serial.ts";
import { SerialService } from "../services/serial/SerialService";

const SerialContext = createContext<{ port: SerialPort | null; service: SerialService | null }>({
  port: null,
  service: null,
});

export function SerialProvider({ port, children }: { port: SerialPort | null; children: React.ReactNode }) {
  const service = useMemo(() => (port ? new SerialService(port) : null), [port]);
  const value = useMemo(() => ({ port, service }), [port, service]);
  return <SerialContext.Provider value={value}>{children}</SerialContext.Provider>;
}

export function useSerialService() {
  return useContext(SerialContext).service;
}

export function useSerialPort() {
  return useContext(SerialContext).port;
}

export function useSerialCommunication() {
  const service = useSerialService();
  const [response, setResponse] = useState<SerialResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sendRequest = useCallback(
    async (request: SerialRequest) => {
      if (!service || !service.isOpened) return;

      setLoading(true);
      setError("");
      try {
        const result = await service.sendProtobufRequest(request);
        setResponse(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        console.error("Error in sendRequest:", err);
      } finally {
        setLoading(false);
      }
    },
    [service]
  );

  return { response, error, loading, sendRequest };
}
