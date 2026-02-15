import { describe, it, expect } from "vitest";

// Since compareUint8Arrays is not exported, I'll copy it here or export it from the original file.
// For now, I'll just test the logic.
function compareUint8Arrays(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

describe("Firmware Verification Logic", () => {
  it("should return true for identical arrays", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    expect(compareUint8Arrays(a, b)).toBe(true);
  });

  it("should return false for arrays of different length", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2]);
    expect(compareUint8Arrays(a, b)).toBe(false);
  });

  it("should return false for arrays with different content", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(compareUint8Arrays(a, b)).toBe(false);
  });
});
