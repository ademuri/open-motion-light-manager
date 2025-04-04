import { useEffect, useRef, useState } from "react";
import "./App.css";
import SerialPortSelector from "./components/SerialPortSelector";
// import { SerialResponse } from "../proto_out/serial.ts";
import { useSerialPort } from "./hooks/useSerialPort";
import { SerialRequest } from "../proto_out/serial";

function App() {
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const [portConnected, setPortConnected] = useState(false);
  const portOpeningRef = useRef(false);
  const [dataLoaded, setDataLoaded] = useState(false);

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
    useSerialPort(selectedPort, request).then(({response, error}) => {
      console.log(response);
      console.log(error);
      setDataLoaded(true);
    })
    .catch((error) => {
      console.log(error);
    })
    .finally(() => {
      console.log("finally");
    });
  }, [selectedPort, portConnected, dataLoaded]);

  return (
    <>
      <SerialPortSelector
        setSelectedPortOnParent={setSelectedPort}
      ></SerialPortSelector>
    </>
  );
}

export default App;
