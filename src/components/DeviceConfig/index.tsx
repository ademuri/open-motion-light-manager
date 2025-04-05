import {
  ConfigPb,
  BrightnessMode,
  ProximityMode,
} from "../../../proto_out/serial";
import "./DeviceConfig.css";

function DeviceConfig({ config }: { config: ConfigPb | null }) {
  if (config === null) {
    return <></>;
  }

  const brightnessModeToString = (mode: BrightnessMode): string => {
    switch (mode) {
      case BrightnessMode.UNSPECIFIED:
        return "Unspecified";
      case BrightnessMode.DISABLED:
        return "Disabled";
      case BrightnessMode.ON_WHEN_BELOW:
        return "On When Below";
      default:
        return "Unknown";
    }
  };

  const proximityModeToString = (mode: ProximityMode): string => {
    switch (mode) {
      case ProximityMode.UNSPECIFIED:
        return "Unspecified";
      case ProximityMode.DISABLED:
        return "Disabled";
      case ProximityMode.TOGGLE:
        return "On When Detected";
      default:
        return "Unknown";
    }
  };

  return (
    <>
      <div className="device-config-container">
        <div className="device-config-item">
          <span className="device-config-label">Version:</span> {config.version}
        </div>
        <div className="device-config-item">
          <span className="device-config-label">Brightness Mode:</span>{" "}
          {brightnessModeToString(config.brightnessMode)}
        </div>
        <div className="device-config-item">
          <span className="device-config-label">
            Auto Brightness Threshold:
          </span>{" "}
          {config.autoBrightnessThreshold}
        </div>
        <div className="device-config-item">
          <span className="device-config-label">Proximity Mode:</span>{" "}
          {proximityModeToString(config.proximityMode)}
        </div>
        <div className="device-config-item">
          <span className="device-config-label">
            Proximity Toggle Timeout (seconds):
          </span>{" "}
          {config.proximityToggleTimeoutSeconds}
        </div>
        <div className="device-config-item">
          <span className="device-config-label">Proximity Threshold:</span>{" "}
          {config.proximityThreshold}
        </div>
      </div>
    </>
  );
}

export default DeviceConfig;
