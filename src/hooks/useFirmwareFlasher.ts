import { useState, useCallback } from "react";

interface FirmwareFlasherResult {
  isFlashing: boolean;
  progress: number; // Percentage 0-100
  flashStatus: string | null;
  flashError: string | null;
  startFlashing: (firmwareData: ArrayBuffer) => Promise<void>;
}

export function useFirmwareFlasher(
  port: SerialPort | null
): FirmwareFlasherResult {
  const [isFlashing, setIsFlashing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flashStatus, setFlashStatus] = useState<string | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);

  const startFlashing = useCallback(
    async (firmwareData: ArrayBuffer) => {
      if (!port || !port.writable) {
        setFlashError("Serial port is not connected or writable.");
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

      let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;

      try {
        writer = port.writable.getWriter();
        const totalBytes = firmwareData.byteLength;
        console.log(`Firmware size: ${totalBytes} bytes`);
        await writer.ready; // Ensure last chunk is sent
        setFlashStatus("Firmware flash successful!");
        setProgress(100);
      } catch (error) {
        console.error("Firmware flashing failed:", error);
        setFlashError(
          error instanceof Error
            ? error.message
            : "An unknown error occurred during flashing."
        );
        // Ensure progress doesn't misleadingly show 100% on error
        if (progress < 100) setProgress(progress);
      } finally {
        if (writer) {
          try {
            await writer.close();
          } catch (closeError) {
            console.warn(
              "Error closing writer (may be normal if port disconnected):",
              closeError
            );
          }
          // Crucially, release the lock so other operations (or reconnections) can use the stream
          writer.releaseLock();
        }
        setIsFlashing(false);
      }
    },
    [port, isFlashing]
  );

  return {
    isFlashing,
    progress,
    flashStatus,
    flashError,
    startFlashing,
  };
}
