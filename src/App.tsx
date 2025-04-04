import { useEffect, useRef, useState } from "react";
import "./App.css";
import SerialPortSelector from "./components/SerialPortSelector";
// import { SerialResponse } from "../proto_out/serial.ts";
import { useSerialPort } from "./hooks/useSerialPort";
import { SerialRequest, SerialResponse } from "../proto_out/serial";

function App() {
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const [portConnected, setPortConnected] = useState(false);
  const [serialResponse, setSerialResponse] = useState<SerialResponse | null>(
    null
  );
  const [serialError, setSerialError] = useState("");
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

  useEffect(() => {
    console.log("Second useEffect running");
    if (!portConnected) {
      console.log("useEffect: port not connected, returning");
      return;
    }

    const request = SerialRequest.create();
    useSerialPort(selectedPort, request)
      .then(({ response, error }) => {
        console.log(response);
        console.log(error);
        setSerialResponse(response);
        setSerialError(error);
      })
      .catch((error) => {
        console.log(error);
        setSerialError(error);
      });
  }, [selectedPort, portConnected]);

  return (
    <>
      <SerialPortSelector
        setSelectedPortOnParent={setSelectedPort}
      ></SerialPortSelector>
      <div>
        {serialError ? <div>{serialError}</div> : null}
        {serialResponse !== null ? (
          <div>{SerialResponse.toJsonString(serialResponse)}</div>
        ) : null}
      </div>
    </>
  );
}

export default App;
