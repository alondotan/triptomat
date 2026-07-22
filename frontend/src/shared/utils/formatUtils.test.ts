import { describe, it, expect } from "vitest";
import { formatFileSize } from "./formatUtils";

describe("formatFileSize", () => {
  it("returns empty string for undefined", () => {
    expect(formatFileSize(undefined)).toBe("");
  });

  it("returns '0 B' for zero", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatFileSize(512)).toBe("512.0 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("formats gigabytes", () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.0 GB");
  });

  it("formats terabytes", () => {
    expect(formatFileSize(1024 ** 4)).toBe("1.0 TB");
  });

  it("rounds to one decimal place", () => {
    expect(formatFileSize(1500)).toBe("1.5 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });
});
