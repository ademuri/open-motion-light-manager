import { useState } from "react";

function SerialPortSelector() {
  const [selectedPort, setSelectedPort] = useState(null);

  const onPortChange = () => {
    navigator.serial.getPorts().then((ports) => {
      if (ports.length > 0) {
        setSelectedPort(ports[0]);
      }
    });
  };

  navigator.serial.addEventListener("connect", (_e) => {
    onPortChange();
  });

  navigator.serial.addEventListener("disconnect", (_e) => {
    onPortChange();
  });

  onPortChange();

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
        // TODO: connect to port
        setSelectedPort(port);
      })
      .catch((e) => {
        // TODO: error handling
        console.log(e);
      });
  };

  const handleChangePort = () => {
    if (selectedPort === null) {
      return;
    }
    selectedPort.forget();
    setSelectedPort(null);
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
