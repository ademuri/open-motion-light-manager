import React from 'react';

interface BaseConfigFieldProps {
  label: string;
  disabled?: boolean;
}

interface NumberConfigFieldProps extends BaseConfigFieldProps {
  value: number | string;
  onChange: (value: number) => void;
  min?: string | number;
  max?: string | number;
}

interface SelectOption {
  label: string;
  value: number;
  disabled?: boolean;
}

interface SelectConfigFieldProps extends BaseConfigFieldProps {
  value: number;
  onChange: (value: number) => void;
  options: SelectOption[];
}

export function ConfigField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="device-config-item">
      <span className="device-config-label">{label}</span>
      {children}
    </div>
  );
}

ConfigField.Number = function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
}: NumberConfigFieldProps) {
  return (
    <ConfigField label={label}>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
          if (!isNaN(val)) {
            onChange(val);
          }
        }}
        disabled={disabled}
      />
    </ConfigField>
  );
};

ConfigField.Select = function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: SelectConfigFieldProps) {
  return (
    <ConfigField label={label}>
      <select
        value={value}
        onChange={(e) => {
          const val = parseInt(e.target.value, 10);
          if (!isNaN(val)) {
            onChange(val);
          }
        }}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </ConfigField>
  );
};
