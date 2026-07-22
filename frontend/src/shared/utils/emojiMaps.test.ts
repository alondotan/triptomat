import { describe, it, expect } from "vitest";
import { categoryEmoji, transportEmoji } from "./emojiMaps";

describe("categoryEmoji", () => {
  it("returns hotel emoji for accommodation", () => {
    expect(categoryEmoji("accommodation")).toBe("🏨");
  });

  it("returns fork emoji for eatery", () => {
    expect(categoryEmoji("eatery")).toBe("🍽️");
  });

  it("returns building emoji for attraction", () => {
    expect(categoryEmoji("attraction")).toBe("🏛️");
  });

  it("returns wrench emoji for service", () => {
    expect(categoryEmoji("service")).toBe("🔧");
  });

  it("returns pin emoji for unknown category", () => {
    expect(categoryEmoji("other")).toBe("📍");
    expect(categoryEmoji("")).toBe("📍");
  });
});

describe("transportEmoji", () => {
  it("returns plane for flight", () => {
    expect(transportEmoji("flight")).toBe("✈️");
  });

  it("returns train for train", () => {
    expect(transportEmoji("train")).toBe("🚂");
  });

  it("returns ferry for ferry", () => {
    expect(transportEmoji("ferry")).toBe("⛴️");
  });

  it("returns bus for bus", () => {
    expect(transportEmoji("bus")).toBe("🚌");
  });

  it("returns taxi for taxi", () => {
    expect(transportEmoji("taxi")).toBe("🚕");
  });

  it("returns car for car_rental", () => {
    expect(transportEmoji("car_rental")).toBe("🚗");
  });

  it("returns rocket for unknown category", () => {
    expect(transportEmoji("other")).toBe("🚀");
    expect(transportEmoji("")).toBe("🚀");
  });
});
