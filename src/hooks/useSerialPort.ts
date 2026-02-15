import { useCallback, useMemo, useState } from "react";
import { SerialRequest, SerialResponse } from "../../proto_out/serial.ts";
import { SerialService } from "../services/serial/SerialService";

export function useSerialService(port: SerialPort | null) {
  return useMemo(() => (port ? new SerialService(port) : null), [port]);
}

export function useSerialCommunication(port: SerialPort | null) {
  const service = useSerialService(port);
  const [response, setResponse] = useState<SerialResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sendRequest = useCallback(
    async (request: SerialRequest) => {
      if (!service || !service.isOpened) return;

      setLoading(true);
      setError("");
      setResponse(null);
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
