import { StatusPb } from "../../../proto_out/serial";
import "./DeviceStatus.css";

function DeviceStatus({ status }: { status: StatusPb | null }) {
  if (status === null) {
    return <></>;
  }

  return (
    <div className="device-status-container">
      <div className="device-status-header">Device Status</div>
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
