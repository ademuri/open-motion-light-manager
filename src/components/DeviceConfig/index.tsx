import {
  ConfigPb,
  BrightnessMode,
  ProximityMode,
} from "../../../proto_out/serial";
import "./DeviceConfig.css";
import { useState, useEffect } from "react";

interface DeviceConfigProps {
  config: ConfigPb | null;
  setConfig: (config: ConfigPb) => void;
}

function DeviceConfig({ config, setConfig }: DeviceConfigProps) {
  const [localConfig, setLocalConfig] = useState<ConfigPb | null>(null);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  if (localConfig === null) {
    return <></>;
  }

  const handleBrightnessModeChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newMode = parseInt(event.target.value, 10) as BrightnessMode;
    setLocalConfig((prevConfig) => {
      if (prevConfig) {
        const updatedConfig = { ...prevConfig, brightnessMode: newMode };
        return updatedConfig;
      }
      return prevConfig;
    });
  };

  const handleProximityModeChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newMode = parseInt(event.target.value, 10) as ProximityMode;
    setLocalConfig((prevConfig) => {
      if (prevConfig) {
        const updatedConfig = { ...prevConfig, proximityMode: newMode };
        return updatedConfig;
      }
      return prevConfig;
    });
  };

  const handleAutoBrightnessThresholdChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newValue = parseInt(event.target.value, 10);
    setLocalConfig((prevConfig) => {
      if (prevConfig) {
        const updatedConfig = {
          ...prevConfig,
          autoBrightnessThreshold: newValue,
        };
        return updatedConfig;
      }
      return prevConfig;
    });
  };

  const handleProximityToggleTimeoutChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newValue = parseInt(event.target.value, 10);
    setLocalConfig((prevConfig) => {
      if (prevConfig) {
        const updatedConfig = {
          ...prevConfig,
          proximityToggleTimeoutSeconds: newValue,
        };
        return updatedConfig;
      }
      return prevConfig;
    });
  };

  const handleProximityThresholdChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newValue = parseInt(event.target.value, 10);
    setLocalConfig((prevConfig) => {
      if (prevConfig) {
        const updatedConfig = {
          ...prevConfig,
          proximityThreshold: newValue,
        };
        return updatedConfig;
      }
      return prevConfig;
    });
  };

  return (
    <>
      <div className="device-config-container">
        <div className="device-config-item">
          <span className="device-config-label">Version:</span>{" "}
          {localConfig.version}
        </div>
        <div className="device-config-item">
          <span className="device-config-label">Brightness Mode:</span>
          <select
            value={localConfig.brightnessMode}
            onChange={handleBrightnessModeChange}
          >
            <option value={BrightnessMode.DISABLED}>Disabled</option>
            <option value={BrightnessMode.ON_WHEN_BELOW}>
              On When Below
            </option>
          </select>
        </div>
        <div className="device-config-item">
          <span className="device-config-label">
            Auto Brightness Threshold:
          </span>
          <input
            type="number"
            value={localConfig.autoBrightnessThreshold}
            onChange={handleAutoBrightnessThresholdChange}
          />
        </div>
        <div className="device-config-item">
          <span className="device-config-label">Proximity Mode:</span>
          <select
            value={localConfig.proximityMode}
            onChange={handleProximityModeChange}
          >
            <option value={ProximityMode.DISABLED}>Disabled</option>
            <option value={ProximityMode.TOGGLE}>On When Detected</option>
          </select>
        </div>
        <div className="device-config-item">
          <span className="device-config-label">
            Proximity Toggle Timeout (seconds):
          </span>
          <input
            type="number"
            value={localConfig.proximityToggleTimeoutSeconds}
            onChange={handleProximityToggleTimeoutChange}
          />
        </div>
        <div className="device-config-item">
          <span className="device-config-label">Proximity Threshold:</span>
          <input
            type="number"
            value={localConfig.proximityThreshold}
            onChange={handleProximityThresholdChange}
          />
        </div>
        <button onClick={setConfig.bind(null, localConfig)} className="device-config-save-button">
          Save
        </button>
      </div>
    </>
  );
}

export default DeviceConfig;
