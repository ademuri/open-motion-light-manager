import {
  ConfigPb,
  BrightnessMode,
  ProximityMode,
  MotionSensitivity,
} from "../../../proto_out/serial";
import "./DeviceConfig.css";
import { useState, useEffect } from "react";
import { ConfigField } from "./ConfigField";

interface DeviceConfigProps {
  config: ConfigPb;
  setConfig: (config: ConfigPb) => void;
  editable?: boolean;
}

type ViewMode = 'simple' | 'advanced';
const VIEW_MODE_STORAGE_KEY = 'deviceConfigViewMode';

function DeviceConfig({
  config,
  setConfig,
  editable = true,
}: DeviceConfigProps) {
  const [localConfig, setLocalConfig] = useState<ConfigPb>(() => {
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
      rampUpTimeMs: 0,
      rampDownTimeMs: 0,
      motionSensitivity: MotionSensitivity.ONE,
    };
    return { ...defaults, ...structuredClone(config) } as ConfigPb;
  });

  // Initialize viewMode state from localStorage or default to 'simple'
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const savedMode = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (savedMode === 'simple' || savedMode === 'advanced') {
      return savedMode;
    }
    return 'simple';
  });

  // Save viewMode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const updateConfig = (updates: Partial<ConfigPb>) => {
    setLocalConfig((prev) => ({ ...prev, ...updates }));
  };

  const handleHardwareVersionChange = (
    value: number,
    field: "major" | "minor" | "subrevision"
  ) => {
    setLocalConfig((prevConfig) => ({
      ...prevConfig,
      hardwareVersion: {
        major: prevConfig.hardwareVersion?.major ?? 0,
        minor: prevConfig.hardwareVersion?.minor ?? 0,
        subrevision: prevConfig.hardwareVersion?.subrevision ?? 0,
        [field]: value,
      },
    }));
  };

  const displayAutoBrightnessThreshold = Math.round(localConfig.autoBrightnessThreshold / 4);

  return (
    <>
      <div className={`device-config-container ${!editable ? "readonly" : ""}`}>
        {/* Mode Selector */}
        <div className="device-config-mode-selector">
          <span>View Mode:</span>
          <label>
            <input
              type="radio"
              name="viewMode"
              value="simple"
              checked={viewMode === 'simple'}
              onChange={() => setViewMode('simple')}
              disabled={!editable}
            /> Simple
          </label>
          <label>
            <input
              type="radio"
              name="viewMode"
              value="advanced"
              checked={viewMode === 'advanced'}
              onChange={() => setViewMode('advanced')}
              disabled={!editable}
            /> Advanced
          </label>
        </div>

        {/* Always Visible Options */}
        <ConfigField.Number
          label="Motion Timeout (seconds):"
          min="0"
          value={localConfig.motionTimeoutSeconds}
          onChange={(val) => updateConfig({ motionTimeoutSeconds: val })}
          disabled={!editable}
        />

        <ConfigField.Select
          label="Motion Sensitivity:"
          value={localConfig.motionSensitivity}
          onChange={(val) => updateConfig({ motionSensitivity: val })}
          disabled={!editable}
          options={[
            { label: "", value: MotionSensitivity.UNSPECIFIED, disabled: true },
            { label: "High", value: MotionSensitivity.ONE },
            { label: "Medium", value: MotionSensitivity.TWO },
            { label: "Low", value: MotionSensitivity.THREE },
          ]}
        />

        <ConfigField.Number
          label="LED Duty Cycle (0-255):"
          min="0"
          max="255"
          value={localConfig.ledDutyCycle}
          onChange={(val) => updateConfig({ ledDutyCycle: val })}
          disabled={!editable}
        />

        <ConfigField.Select
          label="Brightness Mode:"
          value={localConfig.brightnessMode}
          onChange={(val) => updateConfig({ brightnessMode: val })}
          disabled={!editable}
          options={[
            { label: "Disabled", value: BrightnessMode.DISABLED },
            { label: "On When Below", value: BrightnessMode.ON_WHEN_BELOW },
          ]}
        />

        <ConfigField.Number
          label="Auto Brightness Threshold (Lux):"
          min="0"
          value={displayAutoBrightnessThreshold}
          onChange={(val) => updateConfig({ autoBrightnessThreshold: val * 4 })}
          disabled={!editable || localConfig.brightnessMode === BrightnessMode.DISABLED}
        />

        <ConfigField.Select
          label="Proximity Mode:"
          value={localConfig.proximityMode}
          onChange={(val) => updateConfig({ proximityMode: val })}
          disabled={!editable}
          options={[
            { label: "Disabled", value: ProximityMode.DISABLED },
            { label: "Toggle", value: ProximityMode.TOGGLE },
          ]}
        />

        <ConfigField.Number
          label="Proximity Toggle Timeout (seconds):"
          min="0"
          value={localConfig.proximityToggleTimeoutSeconds}
          onChange={(val) => updateConfig({ proximityToggleTimeoutSeconds: val })}
          disabled={!editable || localConfig.proximityMode !== ProximityMode.TOGGLE}
        />

        <ConfigField.Number
          label="Proximity Threshold:"
          min="0"
          value={localConfig.proximityThreshold}
          onChange={(val) => updateConfig({ proximityThreshold: val })}
          disabled={!editable || localConfig.proximityMode === ProximityMode.DISABLED}
        />

        <ConfigField.Number
          label="Ramp Down Time (ms):"
          min="0"
          value={localConfig.rampDownTimeMs}
          onChange={(val) => updateConfig({ rampDownTimeMs: val })}
          disabled={!editable}
        />

        {/* Advanced Options - Conditionally Rendered */}
        {viewMode === 'advanced' && (
          <>
            <ConfigField.Number
              label="Low Battery Cutoff (mV):"
              min="0"
              value={localConfig.lowBatteryCutoffMillivolts}
              onChange={(val) => updateConfig({ lowBatteryCutoffMillivolts: val })}
              disabled={!editable}
            />
            <ConfigField.Number
              label="Low Battery Hysteresis (mV):"
              min="0"
              value={localConfig.lowBatteryHysteresisThresholdMillivolts}
              onChange={(val) => updateConfig({ lowBatteryHysteresisThresholdMillivolts: val })}
              disabled={!editable}
            />
            <ConfigField.Number
              label="Ramp Up Time (ms):"
              min="0"
              value={localConfig.rampUpTimeMs}
              onChange={(val) => updateConfig({ rampUpTimeMs: val })}
              disabled={!editable}
            />
            <ConfigField.Number
              label="Hardware major version:"
              min="0"
              value={localConfig.hardwareVersion?.major ?? ''}
              onChange={(val) => handleHardwareVersionChange(val, "major")}
              disabled={!editable}
            />
            <ConfigField.Number
              label="Hardware minor version:"
              min="0"
              value={localConfig.hardwareVersion?.minor ?? ''}
              onChange={(val) => handleHardwareVersionChange(val, "minor")}
              disabled={!editable}
            />
            <ConfigField.Number
              label="Hardware subrevision version:"
              min="0"
              value={localConfig.hardwareVersion?.subrevision ?? ''}
              onChange={(val) => handleHardwareVersionChange(val, "subrevision")}
              disabled={!editable}
            />
          </>
        )}

        {/* Save Button */}
        <button
          onClick={() => setConfig(localConfig)}
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
