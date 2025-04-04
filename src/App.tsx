import { useEffect, useRef, useState } from "react";
import "./App.css";
import SerialPortSelector from "./components/SerialPortSelector";
import { useSerialCommunication } from "./hooks/useSerialPort";
import { SerialRequest, SerialResponse } from "../proto_out/serial";

function App() {
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const [portConnected, setPortConnected] = useState(false);
  const portOpeningRef = useRef(false);

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
    if (portConnected) {
      const request = SerialRequest.create();
      sendRequest(request);
    }
  }, [portConnected, sendRequest]);

  return (
    <>
      <SerialPortSelector
        setSelectedPortOnParent={setSelectedPort}
      ></SerialPortSelector>
      <div>
        {error ? <div>{error}</div> : null}
        {response !== null ? (
          <div>{SerialResponse.toJsonString(response)}</div>
        ) : null}
      </div>
    </>
  );
}

export default App;
