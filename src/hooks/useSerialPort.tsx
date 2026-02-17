import { useCallback, useContext, useState } from "react";
import { SerialRequest, SerialResponse } from "../../proto_out/serial.ts";
import { SerialContext } from "../context/SerialContext";

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
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        console.error("Error in sendRequest:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [service]
  );

  const resetMcu = useCallback(async () => {
    if (!service) return;
    try {
      await service.resetMcu();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Error resetting MCU:", err);
    }
  }, [service]);

  return { response, error, loading, sendRequest, resetMcu };
}
