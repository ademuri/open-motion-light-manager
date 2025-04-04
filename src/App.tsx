import { useEffect, useRef, useState } from "react";
import "./App.css";
import SerialPortSelector from "./components/SerialPortSelector";
import { SerialResponse } from "../proto_out/serial.ts";

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

        const writer = selectedPort.writable?.getWriter();
        if (!writer) {
          console.log("Port not writable");
          return;
        }
        const requestData = new Uint8Array([0, 0]);
        await writer.write(requestData);
        console.log("Port is writable");
        writer.releaseLock();

        const reader = selectedPort.readable?.getReader();
        if (!reader) {
          console.log("Port not readable");
          return;
        }
        console.log("Port is readable");

        try {
          const result = await reader.read();
          if (result.done) {
            console.log("Reader done before anything read");
            return;
          }
          const data = result.value;
          if (!data) {
            console.log("Failed to read any data");
            return;
          }
          console.log("Read " + data.length + " bytes");
          const hexString = Array.from(data)
            .map((byte) => {
              if (typeof byte !== "number") {
                console.error("Unexpected non-number byte:", byte);
                return "??";
              }
              return byte.toString(16).padStart(2, "0");
            })
            .join(" ");
          console.log(`Data (hex): ${hexString}`);

          if (data[0] & 0x80) {
            console.log("Data too long - varint not implemented");
            return;
          }

          if (data[0] != data.length - 1) {
            console.log(
              `Data length ${data.length - 1} does not match expected length ${
                data[0]
              }`
            );
            return;
          }

          const dataWithoutLength = data.subarray(1);
          const response = SerialResponse.fromBinary(dataWithoutLength);
          console.log(response);
        } catch (error) {
          console.error("Error reading from port:", error);
        } finally {
          reader.releaseLock();
        }
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
