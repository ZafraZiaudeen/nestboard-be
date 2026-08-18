import { describe, it, expect } from "vitest";
import { parseLeaseWindow } from "../lease-window.js";

describe("parseLeaseWindow", () => {
  it("returns null when startMonth is missing", () => {
    expect(parseLeaseWindow(undefined, "3")).toBeNull();
  });

  it("returns null when startMonth has wrong format", () => {
    expect(parseLeaseWindow("2025/09", "3")).toBeNull();
    expect(parseLeaseWindow("2025-9", "3")).toBeNull();
    expect(parseLeaseWindow("September", "3")).toBeNull();
  });

  it("returns null when month is out of range", () => {
    expect(parseLeaseWindow("2025-00", "3")).toBeNull();
    expect(parseLeaseWindow("2025-13", "3")).toBeNull();
  });

  it("returns null when durationMonths is missing", () => {
    expect(parseLeaseWindow("2025-09", undefined)).toBeNull();
  });

  it("returns null when durationMonths is 0 or negative", () => {
    expect(parseLeaseWindow("2025-09", "0")).toBeNull();
    expect(parseLeaseWindow("2025-09", "-1")).toBeNull();
  });

  it("returns null when durationMonths exceeds 24", () => {
    expect(parseLeaseWindow("2025-09", "25")).toBeNull();
  });

  it("returns null when durationMonths is not a number", () => {
    expect(parseLeaseWindow("2025-09", "abc")).toBeNull();
  });

  it("parses a valid single-month window correctly", () => {
    const result = parseLeaseWindow("2025-09", "1");
    expect(result).not.toBeNull();
    expect(result!.start).toEqual(new Date(Date.UTC(2025, 8, 1)));   // 2025-09-01
    expect(result!.end).toEqual(new Date(Date.UTC(2025, 9, 1) - 86400_000)); // 2025-09-30
  });

  it("parses a 3-month window spanning a year boundary", () => {
    const result = parseLeaseWindow("2025-11", "3");
    expect(result).not.toBeNull();
    expect(result!.start).toEqual(new Date(Date.UTC(2025, 10, 1)));  // 2025-11-01
    expect(result!.end).toEqual(new Date(Date.UTC(2026, 1, 1) - 86400_000)); // 2026-01-31
  });

  it("parses the maximum 24-month window", () => {
    const result = parseLeaseWindow("2025-01", "24");
    expect(result).not.toBeNull();
    expect(result!.start).toEqual(new Date(Date.UTC(2025, 0, 1)));   // 2025-01-01
    expect(result!.end).toEqual(new Date(Date.UTC(2027, 0, 1) - 86400_000)); // 2026-12-31
  });
});
