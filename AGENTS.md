# AGENTS.md

## Project Overview
`open-motion-light-manager` is a web-based management tool for the [open-motion-light](https://github.com/ademuri/open-motion-light) hardware device. It allows users to monitor device status, configure parameters (like brightness and motion sensitivity), and update the device's firmware.

The application communicates with the hardware via the **Web Serial API**, using **Protocol Buffers (Protobuf)** for structured messaging.

## Key Technologies
- **Frontend Framework:** React 19 with TypeScript.
- **Build Tool:** Vite.
- **Communication:** Web Serial API.
- **Data Serialization:** Protocol Buffers (using `@protobuf-ts/plugin`).
- **Hardware Protocol:** STM32 Bootloader protocol for firmware updates.

## Architecture
- **`src/App.tsx`**: The main entry point that manages the serial port lifecycle and high-level application state.
- **`src/hooks/useSerialPort.ts`**: Provides hooks (`useSerialService`, `useSerialCommunication`) for interacting with the serial port using the unified `SerialService`.
- **`src/hooks/useFirmwareFlasher.ts`**: Handles the firmware update process using `Stm32BootloaderProtocol` via the `SerialService`.
- **`src/services/serial/`**: Contains the unified serial service and protocol implementations (Protobuf, STM32 Bootloader).
- **`src/services/bootloader/`**: Contains constants and configuration for the STM32 bootloader.
- **`proto/serial.proto`**: Defines the `SerialRequest` and `SerialResponse` messages used for device configuration and status.
- **`public/firmware-vX.X.X.bin`**: Contains the firmware binary files available for flashing.

## Building and Running
> **Note:** To minimize token usage and avoid noisy output, `update-notifier=false` has been configured in `.npmrc`.

- **Install Dependencies:** `npm install`
- **Development Server:** `npm run dev` (Starts a Vite server with HTTPS enabled, which is often required for Web Serial).
- **Production Build:** `npm run build`
- **Protobuf Compilation:** `npm run compile-proto` (Automatically runs during `dev` and `build` via a custom Vite plugin).
- **Linting:** `npm run lint`

## Development Conventions
- **Protobuf Integration:** Proto files are located in `proto/`. Changes to these files will automatically trigger a re-compilation of the TypeScript definitions in `proto_out/` during development.
- **Serial Communication:** Always use the `useSerialCommunication` hook for standard application-level messaging.
- **Firmware Flashing:** Flashing logic is encapsulated in `useFirmwareFlasher` and should be handled with care as it involves direct hardware interaction.
- **Styling:** CSS modules or standard CSS files are used (e.g., `App.css`, `DeviceConfig.css`).
- **Environment:** HTTPS is enabled in Vite config (`basicSsl`) to support Web Serial in local development.
