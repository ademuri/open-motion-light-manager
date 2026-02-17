import { useEffect, useRef, useState, useCallback } from "react";
import "./App.css";
import SerialPortSelector from "./components/SerialPortSelector";
import { useSerialCommunication, useSerialService } from "./hooks/useSerialPort";
import { SerialProvider } from "./context/SerialProvider";
import { ConfigPb, SerialRequest, StatusPb } from "../proto_out/serial";
import DeviceStatus from "./components/DeviceStatus";
import DeviceConfig from "./components/DeviceConfig";
import FirmwareUpdate from "./components/FirmwareUpdate";

function AppContent({ selectedPort, setSelectedPort }: { 
  selectedPort: SerialPort | null, 
  setSelectedPort: (port: SerialPort | null) => void 
}) {
  const service = useSerialService();
  const [portConnected, setPortConnected] = useState(false);
  const portOpeningRef = useRef(false);
  const [status, setStatus] = useState<StatusPb | null>(null);

  const openPort = useCallback(async () => {
    if (selectedPort === null || !service) {
      setPortConnected(false);
    }

    if (selectedPort === null || !service || portOpeningRef.current) {
      return;
    }

    if (service.isOpened) {
      console.log("Port already open");
      setPortConnected(true);
      return;
    }

    portOpeningRef.current = true;

    console.log("Opening port...");
    try {
      await service.open({ baudRate: 115200, bufferSize: 1000 });
      console.log("Connected!");
      setPortConnected(true);
    } catch (error) {
      console.error("Error opening port: ", error);
    } finally {
      portOpeningRef.current = false;
    }
  }, [selectedPort, service]);

  useEffect(() => {
    openPort();
  }, [openPort]);

  const {
    response,
    error,
    loading,
    sendRequest,
    resetMcu,
  } = useSerialCommunication();

  useEffect(() => {
    navigator.serial.addEventListener("disconnect", () => {
      setPortConnected(false);
    });
  }, []);

  const sendInitialRequest = useCallback(() => {
    if (loading) return;
    const request = SerialRequest.create();
    request.requestConfig = true;
    sendRequest(request).catch(() => {});
  }, [sendRequest, loading]);

  const sendConfig = useCallback(
    (config: ConfigPb) => {
      if (loading) return;
      const request = SerialRequest.create();
      request.requestConfig = true;
      request.config = config;
      sendRequest(request).catch(() => {});
    },
    [sendRequest, loading]
  );

  const initialRequestSentRef = useRef(false);

  useEffect(() => {
    if (portConnected && !initialRequestSentRef.current) {
      sendInitialRequest();
      initialRequestSentRef.current = true;
    }
    if (!portConnected) {
      initialRequestSentRef.current = false;
    }
  }, [portConnected, sendInitialRequest]);

  const lastFailureTimeRef = useRef<number | null>(null);

  // Refresh status on error and reset if failing for too long
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (portConnected && error.length > 0 && !loading) {
        if (lastFailureTimeRef.current === null) {
          lastFailureTimeRef.current = Date.now();
        } else if (Date.now() - lastFailureTimeRef.current > 5000) {
          console.log("Communication failure for > 5s, resetting MCU...");
          resetMcu();
          lastFailureTimeRef.current = Date.now(); // Reset the timer so we don't spam resets
        }
        sendInitialRequest();
      } else {
        lastFailureTimeRef.current = null;
      }
    }, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [portConnected, error, loading, sendInitialRequest, resetMcu]);

  useEffect(() => {
    if (response?.status) {
      setStatus(response.status);
    }
  }, [response]);

  const [configCounter, setConfigCounter] = useState(0);
  useEffect(() => {
    if (response?.config) {
      setConfigCounter((c) => c + 1);
    }
  }, [response?.config]);

  return (
    <div className="app-container">
      <SerialPortSelector
        setSelectedPortOnParent={setSelectedPort}
      ></SerialPortSelector>
      <div className="main-content">
        <div className="status-section">
          {loading && <div className="loading-indicator">Refreshing...</div>}
          {!loading && <div className="loading-indicator"></div>}
          {error.length > 0 && selectedPort !== null ? (
            <div className="error-message">{error}</div>
          ) : (
            <div className="error-message"></div>
          )}
          {response === null && selectedPort !== null && portConnected ? (
            <div className="loading-configuration">Loading configuration...</div>
          ) : null}
          {response !== null && response.config != null && (
            <DeviceConfig
              key={configCounter}
              config={response.config}
              setConfig={sendConfig}
              editable={portConnected}
            />
          )}
          {response !== null ? (
            <DeviceStatus connected={portConnected} status={status} />
          ) : null}
          {selectedPort !== null && (
            <div className="status-actions">
              <button onClick={sendInitialRequest} disabled={loading}>Refresh</button>
              <button onClick={resetMcu} disabled={loading}>Reset MCU</button>
            </div>
          )}
        </div>
        <div className="actions-column">
          {
            <FirmwareUpdate
              selectedPort={selectedPort}
              onFlashComplete={openPort}
            />
          }
        </div>
      </div>
    </div>
  );
}

function App() {
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);

  return (
    <SerialProvider port={selectedPort}>
      <AppContent selectedPort={selectedPort} setSelectedPort={setSelectedPort} />
    </SerialProvider>
  );
}

export default App;
