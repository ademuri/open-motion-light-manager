import { StatusPb } from "../../../proto_out/serial";
import "./DeviceStatus.css";

function DeviceStatus({
  connected,
  status,
}: {
  connected: boolean;
  status: StatusPb | null;
}) {
  if (status === null) {
    return <></>;
  }

  return (
    <div className="device-status-container">
      <div className="device-status-header">
        Device Status{" "}
        <span className="disconnected">
          {connected ? "" : " (Disconnected)"}
        </span>
      </div>
      <div className="device-status-item">
        <span className="device-status-label">Firmware Version:</span>{" "}
        {status.firmwareVersion}
      </div>
      <div className="device-status-item">
        <span className="device-status-label">Battery Voltage:</span>{" "}
        {status.batteryVoltage}
      </div>
    </div>
  );
}

export default DeviceStatus;
