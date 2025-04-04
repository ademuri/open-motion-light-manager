import { useEffect, useState } from "react";

function SerialPortSelector({
  setSelectedPortOnParent,
}: {
  setSelectedPortOnParent: (port: SerialPort | null) => void;
}) {
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);

  useEffect(() => {
    const onPortChange = () => {
      navigator.serial.getPorts().then((ports) => {
        if (selectedPort === ports[0]) {
          return;
        }
        if (ports.length > 0) {
          setSelectedPort(ports[0]);
          setSelectedPortOnParent(ports[0]);
        }
      });
    };

    const connectionChangedHandler = () => {
      onPortChange();
    };

    navigator.serial.addEventListener("connect", connectionChangedHandler);
    navigator.serial.addEventListener("disconnect", connectionChangedHandler);

    onPortChange();

    return () => {
      navigator.serial.removeEventListener("connect", connectionChangedHandler);
      navigator.serial.removeEventListener(
        "disconnect",
        connectionChangedHandler
      );
    };
  }, [selectedPort, setSelectedPortOnParent]);

  const handleChoosePort = () => {
    navigator.serial
      .requestPort({
        filters: [
          {
            usbVendorId: 0x1a86,
            usbProductId: 0x7523,
          },
        ],
      })
      .then((port) => {
        setSelectedPort(port);
        setSelectedPortOnParent(port);
      })
      .catch((e) => {
        // TODO: error handling
        console.error(e);
      });
  };

  const handleChangePort = () => {
    if (selectedPort === null) {
      return;
    }
    selectedPort.forget();
    setSelectedPort(null);
    setSelectedPortOnParent(null);
    handleChoosePort();
  };

  return (
    <>
      {selectedPort === null ? (
        <button onClick={handleChoosePort}>Choose port</button>
      ) : (
        <>
          <div>
            <span>Connected</span>
          </div>
          <button onClick={handleChangePort}>Change port</button>
        </>
      )}
    </>
  );
}

export default SerialPortSelector;
