import { useState, useCallback, useMemo } from "react";
import { useSerialService } from "./useSerialPort";
import { FlasherService, FlasherProgress } from "../services/serial/FlasherService";

interface FirmwareFlasherResult {
  isFlashing: boolean;
  progress: number; // Percentage 0-100
  flashStatus: string | null;
  flashError: string | null;
  startFlashing: (firmwareData: ArrayBuffer, signal?: AbortSignal) => Promise<void>;
}

export function useFirmwareFlasher(): FirmwareFlasherResult {
  const service = useSerialService();
  const [isFlashing, setIsFlashing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flashStatus, setFlashStatus] = useState<string | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);

  const flasher = useMemo(() => (service ? new FlasherService(service) : null), [service]);

  const startFlashing = useCallback(
    async (firmwareData: ArrayBuffer, signal?: AbortSignal) => {
      if (!service || !flasher) {
        setFlashError("Serial port is not connected.");
        return;
      }
      
      if (!service.isOpened) {
        setFlashError("Serial port is not open.");
        return;
      }
      
      if (isFlashing) {
        setFlashError("Flashing process already in progress.");
        return;
      }

      setIsFlashing(true);
      setProgress(0);
      setFlashStatus("Starting firmware flash...");
      setFlashError(null);

      const handleProgress = (p: FlasherProgress) => {
        setProgress(p.progress);
        setFlashStatus(p.message);
        if (p.state === 'error') {
           setFlashError(p.message);
        }
      };

      try {
        await flasher.flash(firmwareData, handleProgress, signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          console.log("Firmware flashing cancelled by user.");
        } else {
          console.error("Firmware flashing failed:", error);
          setFlashError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        setIsFlashing(false);
      }
    },
    [service, flasher, isFlashing]
  );

  return { isFlashing, progress, flashStatus, flashError, startFlashing };
}
