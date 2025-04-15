import React, { useState, useEffect } from "react";
import "./FirmwareUpdate.css";
import { useFirmwareFlasher } from "../../hooks/useFirmwareFlasher";

interface FirmwareVersion {
  version: string;
  url: string; // Relative URL to the firmware file in the public directory
}

interface FirmwareUpdateProps {
  selectedPort: SerialPort | null;
}

// --- Updated URLs ---
const availableVersions: FirmwareVersion[] = [
  { version: "Select Version...", url: "" },
  {
    version: "0.1.2",
    // Relative to the `public` directory
    url: "/firmware-v0.1.2.bin",
  },
];

function FirmwareUpdate({ selectedPort }: FirmwareUpdateProps) {
  const [selectedFirmwareUrl, setSelectedFirmwareUrl] = useState<string>(
    availableVersions[0]?.url ?? ""
  );
  const [firmwareData, setFirmwareData] = useState<ArrayBuffer | null>(null);
  const [isLoadingFirmware, setIsLoadingFirmware] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { isFlashing, progress, flashStatus, flashError, startFlashing } =
    useFirmwareFlasher(selectedPort);

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

      try {
        console.log(
          `Attempting to fetch local firmware from: ${selectedFirmwareUrl}`
        );
        // Fetch from the relative URL (served by Vite/GitHub Pages)
        const response = await fetch(selectedFirmwareUrl);

        if (!response.ok) {
          throw new Error(
            `Failed to load firmware: ${response.status} ${response.statusText}`
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
    await startFlashing(firmwareData);
  };

  // Determine button states
  const canSelectVersion = !isLoadingFirmware && !isFlashing;
  const canFlash = firmwareData !== null && !isFlashing && !isLoadingFirmware;

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
      <button
        className="firmware-update-button flash"
        onClick={handleFlashClick}
        disabled={!canFlash}
      >
        {isFlashing
          ? "Flashing..."
          : isLoadingFirmware
          ? "Loading Firmware..."
          : "Flash Device"}
      </button>

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
      {flashStatus &&
        !isFlashing && ( // Show status only when not flashing
          <div className="firmware-update-status">{flashStatus}</div>
        )}
      {loadError && <div className="firmware-update-error">{loadError}</div>}
      {flashError && <div className="firmware-update-error">{flashError}</div>}
    </div>
  );
}

export default FirmwareUpdate;
