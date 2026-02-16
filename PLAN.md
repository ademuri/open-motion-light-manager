# Project Improvement Plan

This plan outlines the steps to address code smells, improve maintainability, and add testing to the Open Motion Light Manager.

## Usage Instructions
- Check off items as they are completed by replacing `[ ]` with `[x]`.
- Update this plan if the approach or scope changes during implementation.
- Create small Git commits for each unit of work.
- Pause after completing each phase to review progress with the user.

## Phase 1: Refactoring for Testability & Reusability
*Goal: Decouple protocol logic from I/O to enable unit testing.*

- [ ] **Structured Errors**:
    - [x] Create `src/services/serial/errors.ts` with structured `SerialError` classes.
    - [x] Verify build and commit.
- [ ] **Low-level Serial Abstraction**:
    - [x] Create `src/services/serial/SerialConnection.ts` to manage port lifecycle and locks.
    - [x] Create `src/services/serial/SerialTransport.ts` for chunk-based and exact-length reads.
    - [x] Verify build and commit.
- [ ] **Protobuf Protocol Decoupling**:
    - [x] Create `src/services/serial/ProtobufProtocol.ts` using the new transport.
    - [x] Verify build and commit.
- [ ] **STM32 Bootloader Protocol Decoupling**:
    - [x] Create `src/services/serial/Stm32BootloaderProtocol.ts` implementing the logic from `bootloaderCommands.ts`.
    - [x] Verify build and commit.
- [ ] **Unified Serial Service Integration**:
    - [x] Create `src/services/serial/SerialService.ts` to provide a high-level API for both Protobuf and STM32 protocols.
    - [x] Refactor `src/hooks/useSerialPort.ts` to use `SerialService`.
    - [ ] **Manual Verification**: Verify that device communication (Protobuf-based config) still works in the UI.
    - [x] Verify build and commit.
- [ ] **Refactor Firmware Flasher**:
    - [x] Refactor `src/hooks/useFirmwareFlasher.ts` to use `Stm32BootloaderProtocol` and `SerialService`.
    - [ ] **Manual Verification**: Verify that the firmware flashing process still initiates and proceeds correctly (requires hardware).
    - [x] Verify build and commit.

## Phase 2: Testing Infrastructure
*Goal: Establish a solid testing foundation.*

- [x] **Set up Vitest**: Install and configure Vitest as the testing framework.
- [x] **Unit Tests**:
    - [x] Add tests for `SerialTransport` and fix data loss bug.
    - [x] Add tests for Protobuf message framing and parsing.
    - [x] Add tests for Bootloader command generation and checksum calculation.
    - [x] Add tests for the firmware verification logic (comparing `Uint8Array`s).
- [x] **Frequent Verification**: Run tests after each change and commit incrementally.

## Phase 3: Robustness & State Management
*Goal: Fix architectural antipatterns and improve reliability.*

- [x] **Refactor `DeviceConfig` State**:
    - [x] Remove the `useEffect` synchronization antipattern.
    - [x] Use the `key` prop to reset internal state when the device configuration changes.
- [x] **Modernize Utilities**:
    - [x] Replace `JSON.parse(JSON.stringify())` with `structuredClone()`.
- [x] **Cancellation Support**:
    - [x] Ensure all long-running serial operations (especially flashing) respect `AbortSignal`.

## Phase 4: UI/UX & Developer Experience (DX) Improvements
*Goal: Reduce boilerplate and improve maintainability.*

- [ ] **Generic Config Components**:
    - [ ] Create a `ConfigField` component to encapsulate labels, inputs, and validation logic for `DeviceConfig`.
- [ ] **Firmware Manifest**:
    - [ ] Move the hardcoded firmware list in `FirmwareUpdate` to a separate JSON manifest or a more manageable configuration file.
- [ ] **Refactor Flasher Logic**:
    - [ ] Extract the `startFlashing` imperative logic into a cleaner state machine or service class.
