import { useEffect, useRef, useState, useCallback } from "react";
import "./App.css";
import SerialPortSelector from "./components/SerialPortSelector";
import { useSerialCommunication, useSerialService } from "./hooks/useSerialPort";
import { ConfigPb, SerialRequest, StatusPb } from "../proto_out/serial";
import DeviceStatus from "./components/DeviceStatus";
import DeviceConfig from "./components/DeviceConfig";
import FirmwareUpdate from "./components/FirmwareUpdate";

function App() {
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const service = useSerialService(selectedPort);
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

  // useEffect(() => {
  //   if (selectedPort !== null && !portConnected) {
  //     const intervalId = setInterval(() => {
  //       console.log("Retrying port connection...");
  //       openPort();
  //     }, 1000);

  //     return () => clearInterval(intervalId);
  //   }
  // }, [selectedPort, portConnected, openPort]);

  const {
    response,
    error,
    loading,
    sendRequest,
  } = useSerialCommunication(selectedPort);

  useEffect(() => {
    navigator.serial.addEventListener("disconnect", () => {
      setPortConnected(false);
    });
  }, []);

  const sendInitialRequest = useCallback(() => {
    if (loading) return;
    const request = SerialRequest.create();
    request.requestConfig = true;
    sendRequest(request);
  }, [sendRequest, loading]);

  const sendConfig = useCallback(
    (config: ConfigPb) => {
      if (loading) return;
      const request = SerialRequest.create();
      request.requestConfig = true;
      request.config = config;
      sendRequest(request);
    },
    [sendRequest, loading]
  );

  useEffect(() => {
    if (portConnected) {
      sendInitialRequest();
    }
  }, [portConnected, sendInitialRequest]);

  // Refresh status on error
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (portConnected && error.length > 0 && !loading) {
        sendInitialRequest();
      }
    }, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [portConnected, error, loading, sendInitialRequest]);

  useEffect(() => {
    if (response?.status) {
      setStatus(response.status);
    }
  }, [response]);

  return (
    <div className="app-container">
      <SerialPortSelector
        setSelectedPortOnParent={setSelectedPort}
      ></SerialPortSelector>
      <div className="status-section">
        {error.length > 0 && selectedPort !== null ? (
          <div className="error-message">{error}</div>
        ) : null}
        {response !== null && response.config != null && (
          <DeviceConfig
            config={response.config}
            setConfig={sendConfig}
            editable={portConnected}
          />
        )}
        {response !== null ? (
          <DeviceStatus connected={portConnected} status={status} />
        ) : null}
        {selectedPort !== null && (
          <button onClick={sendInitialRequest}>Refresh</button>
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
  );
}

export default App;
