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
  editable?: boolean;
}

function DeviceConfig({
  config,
  setConfig,
  editable = true,
}: DeviceConfigProps) {
  const [localConfig, setLocalConfig] = useState<ConfigPb | null>(null);

  useEffect(() => {
    // Create a deep copy to avoid modifying the original prop directly
    if (config) {
      // Ensure all expected fields exist, potentially setting defaults if needed
      // This helps prevent errors if the config from the device is missing fields
      const defaults: Partial<ConfigPb> = {
        version: 1,
        brightnessMode: BrightnessMode.DISABLED,
        autoBrightnessThreshold: 120,
        proximityMode: ProximityMode.DISABLED,
        proximityToggleTimeoutSeconds: 600,
        proximityThreshold: 300,
        motionTimeoutSeconds: 10,
        ledDutyCycle: 255,
        lowBatteryCutoffMillivolts: 3000,
        lowBatteryHysteresisThresholdMillivolts: 3200,
      };
      setLocalConfig({ ...defaults, ...JSON.parse(JSON.stringify(config)) });
    } else {
      setLocalConfig(null);
    }
  }, [config]);

  // Generic handler for number inputs
  const handleNumberInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    fieldName: keyof ConfigPb // Use keyof to ensure fieldName is a valid key of ConfigPb
  ) => {
    const value = event.target.value;
    // Treat empty string as 0 (unspecified).
    const newValue = value === "" ? 0 : parseInt(value, 10);

    if (!isNaN(newValue)) {
      setLocalConfig((prevConfig) => {
        if (prevConfig) {
          const updatedConfig = {
            ...prevConfig,
            [fieldName]: newValue, // Use computed property name
          };
          return updatedConfig;
        }
        return prevConfig;
      });
    }
  };

  // Generic handler for select inputs (enums are numbers)
  const handleSelectChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
    fieldName: keyof ConfigPb
  ) => {
    const newValue = parseInt(event.target.value, 10);
    if (!isNaN(newValue)) {
      setLocalConfig((prevConfig) => {
        if (prevConfig) {
          const updatedConfig = { ...prevConfig, [fieldName]: newValue };
          return updatedConfig;
        }
        return prevConfig;
      });
    }
  };

  // Specific handler for Auto Brightness Threshold with scaling
  const handleAutoBrightnessThresholdChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const displayValue = event.target.value;
    // Treat empty string as 0 for the display value, which means 0 for the stored value.
    const parsedDisplayValue = displayValue === "" ? 0 : parseInt(displayValue, 10);

    if (!isNaN(parsedDisplayValue)) {
      const storedValue = parsedDisplayValue * 4; // Scale the input value by 4 for storage
      setLocalConfig((prevConfig) => {
        if (prevConfig) {
          const updatedConfig = {
            ...prevConfig,
            autoBrightnessThreshold: storedValue, // Store the scaled value
          };
          return updatedConfig;
        }
        return prevConfig;
      });
    }
  };


  if (localConfig === null) {
    return (
      <div className="device-config-container">Loading configuration...</div>
    );
  }

  const handleBrightnessModeChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => handleSelectChange(event, "brightnessMode");
  const handleProximityModeChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => handleSelectChange(event, "proximityMode");
  const handleProximityToggleTimeoutChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => handleNumberInputChange(event, "proximityToggleTimeoutSeconds");
  const handleProximityThresholdChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => handleNumberInputChange(event, "proximityThreshold");
  const handleMotionTimeoutChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => handleNumberInputChange(event, "motionTimeoutSeconds");
  const handleLedDutyCycleChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => handleNumberInputChange(event, "ledDutyCycle");
  const handleLowBatteryCutoffChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => handleNumberInputChange(event, "lowBatteryCutoffMillivolts");
  const handleLowBatteryHysteresisChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) =>
    handleNumberInputChange(event, "lowBatteryHysteresisThresholdMillivolts");

  // Calculate the display value for auto brightness threshold
  const displayAutoBrightnessThreshold = Math.round(localConfig.autoBrightnessThreshold / 4);

  return (
    <>
      <div className={`device-config-container ${!editable ? "readonly" : ""}`}>
        <div className="device-config-item">
          <span className="device-config-label">Motion Timeout (seconds):</span>
          <input
            type="number"
            min="0"
            value={localConfig.motionTimeoutSeconds}
            onChange={handleMotionTimeoutChange}
            disabled={!editable}
          />
        </div>
        <div className="device-config-item">
          <span className="device-config-label">LED Duty Cycle (0-255):</span>
          <input
            type="number"
            min="0"
            max="255"
            value={localConfig.ledDutyCycle}
            onChange={handleLedDutyCycleChange}
            disabled={!editable}
          />
        </div>
        <div className="device-config-item">
          <span className="device-config-label">Brightness Mode:</span>
          <select
            value={localConfig.brightnessMode}
            onChange={handleBrightnessModeChange}
            disabled={!editable}
          >
            <option value={BrightnessMode.DISABLED}>Disabled</option>
            <option value={BrightnessMode.ON_WHEN_BELOW}>On When Below</option>
          </select>
        </div>
        <div className="device-config-item">
          <span className="device-config-label">
            Auto Brightness Threshold (Lux):
          </span>
          <input
            type="number"
            min="0"
            // Display the scaled-down value
            value={displayAutoBrightnessThreshold}
            // Use the specific handler that scales the value up on change
            onChange={handleAutoBrightnessThresholdChange}
            disabled={!editable}
          />
        </div>
        <div className="device-config-item">
          <span className="device-config-label">Proximity Mode:</span>
          <select
            value={localConfig.proximityMode}
            onChange={handleProximityModeChange}
            disabled={!editable}
          >
            <option value={ProximityMode.DISABLED}>Disabled</option>
            <option value={ProximityMode.TOGGLE}>Toggle</option>
          </select>
        </div>
        <div className="device-config-item">
          <span className="device-config-label">
            Proximity Toggle Timeout (seconds):
          </span>
          <input
            type="number"
            min="0"
            value={localConfig.proximityToggleTimeoutSeconds}
            onChange={handleProximityToggleTimeoutChange}
            disabled={!editable}
          />
        </div>
        <div className="device-config-item">
          <span className="device-config-label">Proximity Threshold:</span>
          <input
            type="number"
            min="0"
            value={localConfig.proximityThreshold}
            onChange={handleProximityThresholdChange}
            disabled={!editable}
          />
        </div>
        <div className="device-config-item">
          <span className="device-config-label">Low Battery Cutoff (mV):</span>
          <input
            type="number"
            min="0"
            value={localConfig.lowBatteryCutoffMillivolts}
            onChange={handleLowBatteryCutoffChange}
            disabled={!editable}
          />
        </div>
        <div className="device-config-item">
          <span className="device-config-label">
            Low Battery Hysteresis (mV):
          </span>
          <input
            type="number"
            min="0"
            value={localConfig.lowBatteryHysteresisThresholdMillivolts}
            onChange={handleLowBatteryHysteresisChange}
            disabled={!editable}
          />
        </div>
        <button
          onClick={() => localConfig && setConfig(localConfig)}
          className="device-config-save-button"
          disabled={!editable}
        >
          Save Configuration
        </button>
      </div>
    </>
  );
}

export default DeviceConfig;
