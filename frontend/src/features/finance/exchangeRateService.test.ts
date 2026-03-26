import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCurrenciesForCountries,
  convertToPreferred,
  fetchExchangeRates,
  fetchSingleRate,
  type ExchangeRates,
} from "./exchangeRateService";

// ── Pure functions (no mocking) ──────────────────────────

describe("getCurrenciesForCountries", () => {
  it("maps known countries to currencies", () => {
    const result = getCurrenciesForCountries(["Israel", "France"]);
    expect(result).toContain("ILS");
    expect(result).toContain("EUR");
  });

  it("deduplicates EUR countries", () => {
    const result = getCurrenciesForCountries(["France", "Germany", "Italy"]);
    expect(result).toEqual(["EUR"]);
  });

  it("excludes unknown countries", () => {
    const result = getCurrenciesForCountries(["Narnia", "Israel"]);
    expect(result).toEqual(["ILS"]);
  });

  it("returns empty for empty input", () => {
    expect(getCurrenciesForCountries([])).toEqual([]);
  });

  it("handles USA and UK aliases", () => {
    const result = getCurrenciesForCountries(["USA", "UK"]);
    expect(result).toContain("USD");
    expect(result).toContain("GBP");
  });
});

describe("convertToPreferred", () => {
  const rates: ExchangeRates = {
    base: "ILS",
    rates: { ILS: 1, USD: 3.6, EUR: 4.0 },
    fetchedAt: "2026-01-01T00:00:00Z",
  };

  it("returns amount unchanged if same currency as base", () => {
    expect(convertToPreferred(100, "ILS", rates)).toBe(100);
  });

  it("multiplies amount by rate", () => {
    expect(convertToPreferred(10, "USD", rates)).toBe(36);
  });

  it("returns null for unknown currency", () => {
    expect(convertToPreferred(10, "JPY", rates)).toBeNull();
  });

  it("returns 0 for zero amount", () => {
    expect(convertToPreferred(0, "USD", rates)).toBe(0);
  });

  it("handles decimal precision", () => {
    const result = convertToPreferred(1, "EUR", rates);
    expect(result).toBe(4.0);
  });
});

// ── Functions with fetch mocking ─────────────────────────

describe("fetchExchangeRates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("inverts rates correctly", async () => {
    // API returns: 1 ILS = 0.27 USD, 1 ILS = 0.25 EUR
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ rates: { USD: 0.27, EUR: 0.25 } }),
      }),
    );

    const result = await fetchExchangeRates("ILS", []);
    expect(result.base).toBe("ILS");
    expect(result.rates.ILS).toBe(1);
    // Inverted: 1 USD = 1/0.27 ≈ 3.7037
    expect(result.rates.USD).toBeCloseTo(1 / 0.27, 4);
    expect(result.rates.EUR).toBeCloseTo(1 / 0.25, 4);
  });

  it("includes country-specific currencies in request", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rates: { USD: 0.27, EUR: 0.25, GBP: 0.21 } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchExchangeRates("ILS", ["United Kingdom"]);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("GBP");
  });

  it("removes base currency from symbols", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rates: { EUR: 0.92 } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchExchangeRates("USD", []);
    const url = mockFetch.mock.calls[0][0] as string;
    // USD is the base, should not appear in symbols
    const symbolsPart = url.split("symbols=")[1];
    expect(symbolsPart).not.toContain("USD");
  });

  it("returns fallback 1:1 rates on API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    const result = await fetchExchangeRates("ILS", []);
    expect(result.base).toBe("ILS");
    expect(result.rates).toEqual({ ILS: 1 });
  });

  it("returns fallback on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const result = await fetchExchangeRates("EUR", []);
    expect(result.base).toBe("EUR");
    expect(result.rates).toEqual({ EUR: 1 });
  });
});

describe("fetchSingleRate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 1 for same currency without fetching", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchSingleRate("USD", "USD");
    expect(result).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns inverted rate on success", async () => {
    // API: 1 ILS = 0.27 USD → inverted: 1 USD = 1/0.27
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ rates: { USD: 0.27 } }),
      }),
    );

    const result = await fetchSingleRate("USD", "ILS");
    expect(result).toBeCloseTo(1 / 0.27, 4);
  });

  it("returns null on API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false }),
    );

    const result = await fetchSingleRate("USD", "ILS");
    expect(result).toBeNull();
  });

  it("returns null when rate missing in response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ rates: {} }),
      }),
    );

    const result = await fetchSingleRate("JPY", "ILS");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const result = await fetchSingleRate("USD", "ILS");
    expect(result).toBeNull();
  });
});
