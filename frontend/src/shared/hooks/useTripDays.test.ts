import { describe, it, expect } from "vitest";
import { tripDayDate } from "./useTripDays";

describe("tripDayDate", () => {
  it("returns the start date for day 1", () => {
    expect(tripDayDate("2024-03-15", 1)).toBe("2024-03-15");
  });

  it("returns correct date for day 3", () => {
    expect(tripDayDate("2024-03-15", 3)).toBe("2024-03-17");
  });

  it("handles month boundary", () => {
    expect(tripDayDate("2024-03-30", 3)).toBe("2024-04-01");
  });

  it("handles year boundary", () => {
    expect(tripDayDate("2024-12-31", 2)).toBe("2025-01-01");
  });

  it("returns undefined when startDate is undefined", () => {
    expect(tripDayDate(undefined, 1)).toBeUndefined();
  });

  it("returns correct date for large day numbers", () => {
    expect(tripDayDate("2024-01-01", 31)).toBe("2024-01-31");
  });
});
