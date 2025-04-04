import { useEffect, useRef, useState } from "react";
import "./App.css";
import SerialPortSelector from "./components/SerialPortSelector";
import { useSerialCommunication } from "./hooks/useSerialPort";
import { SerialRequest, StatusPb } from "../proto_out/serial";
import DeviceStatus from "./components/DeviceStatus";

function App() {
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const [portConnected, setPortConnected] = useState(false);
  const portOpeningRef = useRef(false);
  const [status, setStatus] = useState<StatusPb | null>(null);

  useEffect(() => {
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
    selectedPort
      .open({ baudRate: 115200 })
      .catch((error) => {
        console.log("Error opening port: ", error);
        portOpeningRef.current = false;
      })
      .then(async () => {
        console.log("Connected!");
        portOpeningRef.current = false;
        setPortConnected(true);
      });
  }, [selectedPort]);

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
  });

  useEffect(() => {
    if (portConnected) {
      const request = SerialRequest.create();
      sendRequest(request);
    }
  }, [portConnected, sendRequest]);

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
        {error ? <div className="error-message">{error}</div> : null}
        {response !== null ? (
          <DeviceStatus connected={portConnected} status={status} />
        ) : null}
      </div>
    </div>
  );
}

export default App;
