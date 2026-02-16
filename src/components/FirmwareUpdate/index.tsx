import React, { useState, useEffect } from "react";
import "./FirmwareUpdate.css";
import { useFirmwareFlasher } from "../../hooks/useFirmwareFlasher";

interface FirmwareVersion {
  version: string;
  url: string; // Relative URL to the firmware file *within* the public directory
}

interface FirmwareUpdateProps {
  selectedPort: SerialPort | null;
  /** Optional callback function triggered when flashing completes successfully. */
  onFlashComplete?: () => void;
}

// URL is relative to the `public` directory - NO leading slash
const availableVersions: FirmwareVersion[] = [
  {
    version: "0.1.6",
    url: "firmware-v0.1.6.bin",
  },
  {
    version: "0.1.5",
    url: "firmware-v0.1.5.bin",
  },
  {
    version: "0.1.4",
    url: "firmware-v0.1.4.bin",
  },
  {
    version: "0.1.3",
    url: "firmware-v0.1.3.bin",
  },
  {
    version: "0.1.2",
    url: "firmware-v0.1.2.bin",
  },
];

function FirmwareUpdate({
  selectedPort,
  onFlashComplete,
}: FirmwareUpdateProps) {
  const [selectedFirmwareUrl, setSelectedFirmwareUrl] = useState<string>(
    availableVersions[0]?.url ?? ""
  );
  const [firmwareData, setFirmwareData] = useState<ArrayBuffer | null>(null);
  const [isLoadingFirmware, setIsLoadingFirmware] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const { isFlashing, progress, flashStatus, flashError, startFlashing } =
    useFirmwareFlasher();

  // Effect to fetch firmware when URL changes
  useEffect(() => {
    const fetchFirmware = async () => {
      if (!selectedFirmwareUrl) {
        setFirmwareData(null);
        setLoadError(null);
        return;
      }

      setIsLoadingFirmware(true);
      setLoadError(null);
      setFirmwareData(null);

      // Construct the full URL using the base path and the relative firmware path
      // import.meta.env.BASE_URL will be '/' in dev and '/<repoName>/' in prod build
      const fullUrl = import.meta.env.BASE_URL + selectedFirmwareUrl;

      try {
        console.log(
          `Attempting to fetch local firmware from: ${fullUrl}` // Use the constructed full URL
        );
        // Fetch from the dynamically constructed URL
        const response = await fetch(fullUrl); // Use the constructed full URL

        if (!response.ok) {
          throw new Error(
            `Failed to load firmware: ${response.status} ${response.statusText} from ${fullUrl}`
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        setFirmwareData(arrayBuffer);
        console.log("Firmware loaded successfully into memory.");
      } catch (error) {
        console.error("Firmware loading failed:", error);
        setLoadError(
          error instanceof Error ? error.message : "An unknown error occurred."
        );
        setFirmwareData(null);
      } finally {
        setIsLoadingFirmware(false);
      }
    };

    fetchFirmware();
  }, [selectedFirmwareUrl]); // Re-run when the selected URL changes

  const handleVersionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedFirmwareUrl(event.target.value);
  };

  const handleFlashClick = async () => {
    if (!firmwareData) {
      setLoadError("No firmware data loaded. Select a version.");
      return;
    }
    if (!selectedPort) {
      setLoadError("Serial port not selected or connected.");
      return;
    }
    setLoadError(null);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      if (selectedPort.readable || selectedPort.writable) {
        await selectedPort.close();
      }
      await selectedPort.open({
        baudRate: 115200,
        bufferSize: 1000,
        parity: "even",
        dataBits: 8,
        stopBits: 1,
        flowControl: "none",
      });
      await startFlashing(firmwareData, controller.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.log("Flash cancelled by user.");
      } else {
        console.error("Error during port handling or starting flash:", err);
        setLoadError(
          `Port error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } finally {
      setAbortController(null);
      await selectedPort.close();
      if (onFlashComplete) {
        onFlashComplete();
      }
    }
  };

  const handleCancelClick = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  // Determine button states
  const canSelectVersion = !isLoadingFirmware && !isFlashing;
  const canFlash =
    firmwareData !== null &&
    !isFlashing &&
    !isLoadingFirmware &&
    selectedPort !== null;

  return (
    <div className="firmware-update-container">
      <div className="firmware-update-header">Firmware Update</div>
      <div className="firmware-update-item">
        <span className="firmware-update-label">Select Version:</span>
        <select
          className="firmware-update-select"
          value={selectedFirmwareUrl}
          onChange={handleVersionChange}
          disabled={!canSelectVersion}
        >
          {availableVersions.map((fw) => (
            <option key={fw.url || "select"} value={fw.url}>
              {fw.version}
            </option>
          ))}
        </select>
      </div>

      {/* Flash Button - Enabled only when firmware is loaded and not flashing */}
      {!isFlashing ? (
        <button
          className="firmware-update-button flash"
          onClick={handleFlashClick}
          disabled={!canFlash}
        >
          {isLoadingFirmware ? "Loading Firmware..." : "Flash Device"}
        </button>
      ) : (
        <button
          className="firmware-update-button cancel"
          onClick={handleCancelClick}
        >
          Cancel
        </button>
      )}

      {/* Progress Bar and Status */}
      {isFlashing && (
        <div className="firmware-update-progress-container">
          <div className="firmware-update-progress-bar-outer">
            <div
              className="firmware-update-progress-bar-inner"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <span className="firmware-update-progress-text">{progress}%</span>
        </div>
      )}

      {/* Status/Error Messages */}
      {flashStatus && (
        <div className="firmware-update-status">{flashStatus}</div>
      )}
      {loadError && <div className="firmware-update-error">{loadError}</div>}
      {flashError && <div className="firmware-update-error">{flashError}</div>}
    </div>
  );
}

export default FirmwareUpdate;
