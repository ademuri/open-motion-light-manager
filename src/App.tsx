import { useEffect, useRef, useState } from "react";
import "./App.css";
import SerialPortSelector from "./components/SerialPortSelector";

function App() {
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const portOpeningRef = useRef(false);

  useEffect(() => {
    if (selectedPort === null || portOpeningRef.current) {
      return;
    }

    if (selectedPort.readable) {
      console.log("Port already open");
    }

    portOpeningRef.current = true;

    selectedPort.onconnect = () => {
      console.log("Connected!");
      portOpeningRef.current = false;
    };

    console.log("Opening port...");
    selectedPort.open({ baudRate: 15200 }).catch((error) => {
      console.log("Error opening port: ", error);
      portOpeningRef.current = false;
    });
  }, [selectedPort]);

  return (
    <>
      <SerialPortSelector
        setSelectedPortOnParent={setSelectedPort}
      ></SerialPortSelector>
    </>
  );
}

export default App;
