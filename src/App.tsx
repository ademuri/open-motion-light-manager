import { useEffect, useRef, useState, useCallback } from "react";
import "./App.css";
import SerialPortSelector from "./components/SerialPortSelector";
import { useSerialCommunication } from "./hooks/useSerialPort";
import { ConfigPb, SerialRequest, StatusPb } from "../proto_out/serial";
import DeviceStatus from "./components/DeviceStatus";
import DeviceConfig from "./components/DeviceConfig";

function App() {
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const [portConnected, setPortConnected] = useState(false);
  const portOpeningRef = useRef(false);
  const [status, setStatus] = useState<StatusPb | null>(null);

  const openPort = useCallback(async () => {
    if (selectedPort === null || portOpeningRef.current) {
      return;
    }

    if (selectedPort.readable) {
      console.log("Port already open");
      setPortConnected(true);
      return;
    }

    portOpeningRef.current = true;

    console.log("Opening port...");
    try {
      await selectedPort.open({ baudRate: 115200, bufferSize: 1000 });
      console.log("Connected!");
      setPortConnected(true);
    } catch (error) {
      console.log("Error opening port: ", error);
    } finally {
      portOpeningRef.current = false;
    }
  }, [selectedPort]);

  useEffect(() => {
    openPort();
  }, [openPort]);

  useEffect(() => {
    if (selectedPort !== null && !portConnected) {
      const intervalId = setInterval(() => {
        console.log("Retrying port connection...");
        openPort();
      }, 1000);

      return () => clearInterval(intervalId);
    }
  }, [selectedPort, portConnected, openPort]);

  const {
    response,
    error,
    loading: _loading,
    sendRequest,
  } = useSerialCommunication(selectedPort);

  useEffect(() => {
    navigator.serial.addEventListener("disconnect", () => {
      setPortConnected(false);
    });
  }, []);

  const sendInitialRequest = useCallback(() => {
    const request = SerialRequest.create();
    request.requestConfig = true;
    sendRequest(request);
  }, [sendRequest]);

  const sendConfig = useCallback((config: ConfigPb) => {
    const request = SerialRequest.create();
    request.requestConfig = true;
    request.config = config;
    sendRequest(request);
  }, [sendRequest]);

  useEffect(() => {
    if (portConnected) {
      sendInitialRequest();
    }
  }, [portConnected, sendInitialRequest]);

  // TODO: re-enable and add some error correction
  // useEffect(() => {
  //   let count = 0;
  //   const intervalId = setInterval(() => {
  //     count++;

  //     // Refresh quickly for error and slowly otherwise
  //     if (portConnected && (error.length > 0 || count % 10 === 0)) {
  //       sendInitialRequest();
  //     }
  //   }, 1000);

  //   return () => {
  //     clearInterval(intervalId);
  //   };
  // }, [portConnected, error, sendInitialRequest]);

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
          <DeviceConfig config={response.config} setConfig={sendConfig} />
        )}
        {response !== null ? (
          <DeviceStatus connected={portConnected} status={status} />
        ) : null}
        {selectedPort !== null && <button onClick={sendInitialRequest}>Refresh</button>}
      </div>
    </div>
  );
}

export default App;
