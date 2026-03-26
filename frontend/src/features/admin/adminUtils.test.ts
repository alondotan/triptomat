import { describe, it, expect } from "vitest";
import { formatDateTime, formatDate, formatFileSize } from "./adminUtils";

describe("formatFileSize", () => {
  it("returns '0 B' for zero bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500.0 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(1048576)).toBe("1.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatFileSize(1073741824)).toBe("1.0 GB");
  });

  it("formats fractional values", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats large megabyte values", () => {
    const result = formatFileSize(47_849_267);
    expect(result).toMatch(/^\d+\.\d MB$/);
  });
});

describe("formatDateTime", () => {
  it("returns a string", () => {
    expect(typeof formatDateTime("2026-03-14T10:30:00Z")).toBe("string");
  });

  it("returns non-empty for valid ISO string", () => {
    expect(formatDateTime("2026-03-14T10:30:00Z").length).toBeGreaterThan(0);
  });
});

describe("formatDate", () => {
  it("returns a string", () => {
    expect(typeof formatDate("2026-03-14T10:30:00Z")).toBe("string");
  });

  it("returns non-empty for valid ISO string", () => {
    expect(formatDate("2026-03-14T10:30:00Z").length).toBeGreaterThan(0);
  });
});
