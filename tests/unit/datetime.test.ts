import { describe, expect, it } from "vitest";
import {
  dateKey,
  isoToLocalDateTimeInput,
  localDateTimeInputToIso,
} from "../../src/frontend/utils/datetime";

describe("Lisbon datetime helpers", () => {
  it("formats UTC timestamps as Lisbon wall-clock time", () => {
    expect(isoToLocalDateTimeInput("2026-01-15T12:30:00.000Z")).toBe(
      "2026-01-15T12:30",
    );
    expect(isoToLocalDateTimeInput("2026-07-15T12:30:00.000Z")).toBe(
      "2026-07-15T13:30",
    );
  });

  it("converts Lisbon wall-clock input back to UTC ISO", () => {
    expect(localDateTimeInputToIso("2026-01-15T12:30")).toBe(
      "2026-01-15T12:30:00.000Z",
    );
    expect(localDateTimeInputToIso("2026-07-15T13:30")).toBe(
      "2026-07-15T12:30:00.000Z",
    );
  });

  it("uses Lisbon calendar dates for UTC instants", () => {
    expect(dateKey(new Date("2026-07-15T23:30:00.000Z"))).toBe("2026-07-16");
  });
});
