import { describe, it, expect } from "vitest";
import { createTripSchema } from "./trip.schema";
import { createPOISchema } from "./poi.schema";
import { createTransportSchema } from "./transport.schema";
import { createExpenseSchema } from "./expense.schema";
import { urlSchema } from "./url.schema";

// ── Trip Schema ──────────────────────────────────────────

describe("createTripSchema", () => {
  const validTrip = {
    name: "Amsterdam Trip",
    countries: ["NL"],
    startDate: "2026-04-01",
    endDate: "2026-04-10",
  };

  it("accepts valid trip", () => {
    expect(createTripSchema.parse(validTrip)).toMatchObject(validTrip);
  });

  it("accepts optional description", () => {
    const result = createTripSchema.parse({ ...validTrip, description: "Fun!" });
    expect(result.description).toBe("Fun!");
  });

  it("rejects missing name", () => {
    const { name, ...rest } = validTrip;
    expect(() => createTripSchema.parse(rest)).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => createTripSchema.parse({ ...validTrip, name: "" })).toThrow();
  });

  it("rejects empty countries array", () => {
    expect(() => createTripSchema.parse({ ...validTrip, countries: [] })).toThrow();
  });

  it("rejects invalid date format", () => {
    expect(() => createTripSchema.parse({ ...validTrip, startDate: "01-04-2026" })).toThrow();
  });

  it("rejects endDate before startDate", () => {
    expect(() =>
      createTripSchema.parse({ ...validTrip, startDate: "2026-04-10", endDate: "2026-04-01" }),
    ).toThrow();
  });

  it("accepts same start and end date", () => {
    expect(() =>
      createTripSchema.parse({ ...validTrip, startDate: "2026-04-01", endDate: "2026-04-01" }),
    ).not.toThrow();
  });
});

// ── POI Schema ───────────────────────────────────────────

describe("createPOISchema", () => {
  const validPOI = {
    name: "Anne Frank House",
    category: "attraction" as const,
    status: "candidate" as const,
  };

  it("accepts valid POI with required fields only", () => {
    expect(createPOISchema.parse(validPOI)).toMatchObject(validPOI);
  });

  it("accepts all optional fields", () => {
    const full = {
      ...validPOI,
      subCategory: "museum",
      country: "NL",
      city: "Amsterdam",
      address: "Prinsengracht 263",
      costAmount: 16,
      costCurrency: "EUR",
      notes: "Book in advance",
    };
    expect(createPOISchema.parse(full)).toMatchObject(full);
  });

  it("rejects invalid category", () => {
    expect(() => createPOISchema.parse({ ...validPOI, category: "hotel" })).toThrow();
  });

  it("rejects invalid status", () => {
    expect(() => createPOISchema.parse({ ...validPOI, status: "done" })).toThrow();
  });

  it("rejects non-positive cost", () => {
    expect(() => createPOISchema.parse({ ...validPOI, costAmount: 0 })).toThrow();
    expect(() => createPOISchema.parse({ ...validPOI, costAmount: -5 })).toThrow();
  });

  it("rejects currency not 3 chars", () => {
    expect(() => createPOISchema.parse({ ...validPOI, costCurrency: "EU" })).toThrow();
    expect(() => createPOISchema.parse({ ...validPOI, costCurrency: "EURO" })).toThrow();
  });
});

// ── Transport Schema ─────────────────────────────────────

describe("createTransportSchema", () => {
  const validTransport = {
    category: "flight" as const,
    status: "booked" as const,
    segments: [{ fromName: "AMS", toName: "TLV" }],
  };

  it("accepts valid transport", () => {
    expect(createTransportSchema.parse(validTransport)).toMatchObject(validTransport);
  });

  it("accepts full segment details", () => {
    const full = {
      ...validTransport,
      segments: [{
        fromName: "Amsterdam Schiphol",
        fromCode: "AMS",
        toName: "Ben Gurion",
        toCode: "TLV",
        departureTime: "2026-04-01T10:00",
        arrivalTime: "2026-04-01T15:00",
        flightNumber: "LY318",
      }],
      carrierName: "El Al",
      orderNumber: "ABC123",
      costAmount: 350,
      costCurrency: "EUR",
      notes: "Window seat",
    };
    expect(createTransportSchema.parse(full)).toMatchObject(full);
  });

  it("rejects empty segments array", () => {
    expect(() =>
      createTransportSchema.parse({ ...validTransport, segments: [] }),
    ).toThrow();
  });

  it("rejects segment without fromName", () => {
    expect(() =>
      createTransportSchema.parse({
        ...validTransport,
        segments: [{ toName: "TLV" }],
      }),
    ).toThrow();
  });

  it("rejects segment without toName", () => {
    expect(() =>
      createTransportSchema.parse({
        ...validTransport,
        segments: [{ fromName: "AMS" }],
      }),
    ).toThrow();
  });

  it("rejects invalid category", () => {
    expect(() =>
      createTransportSchema.parse({ ...validTransport, category: "helicopter" }),
    ).toThrow();
  });

  it("rejects negative cost", () => {
    expect(() =>
      createTransportSchema.parse({ ...validTransport, costAmount: -10 }),
    ).toThrow();
  });

  it("accepts zero cost", () => {
    expect(() =>
      createTransportSchema.parse({ ...validTransport, costAmount: 0 }),
    ).not.toThrow();
  });
});

// ── Expense Schema ───────────────────────────────────────

describe("createExpenseSchema", () => {
  const validExpense = {
    description: "Lunch at cafe",
    category: "food" as const,
    amount: 25.5,
    currency: "EUR",
  };

  it("accepts valid expense", () => {
    expect(createExpenseSchema.parse(validExpense)).toMatchObject(validExpense);
  });

  it("accepts optional date and notes", () => {
    const full = { ...validExpense, date: "2026-04-05", notes: "Good food" };
    expect(createExpenseSchema.parse(full)).toMatchObject(full);
  });

  it("rejects missing description", () => {
    const { description, ...rest } = validExpense;
    expect(() => createExpenseSchema.parse(rest)).toThrow();
  });

  it("rejects non-positive amount", () => {
    expect(() => createExpenseSchema.parse({ ...validExpense, amount: 0 })).toThrow();
    expect(() => createExpenseSchema.parse({ ...validExpense, amount: -5 })).toThrow();
  });

  it("rejects currency not 3 chars", () => {
    expect(() => createExpenseSchema.parse({ ...validExpense, currency: "EU" })).toThrow();
  });

  it("rejects invalid date format", () => {
    expect(() => createExpenseSchema.parse({ ...validExpense, date: "04-05-2026" })).toThrow();
  });

  it("accepts all expense categories", () => {
    const categories = ["food", "transport", "accommodation", "attraction", "shopping", "communication", "insurance", "tips", "other"];
    for (const cat of categories) {
      expect(() => createExpenseSchema.parse({ ...validExpense, category: cat })).not.toThrow();
    }
  });
});

// ── URL Schema ───────────────────────────────────────────

describe("urlSchema", () => {
  it("accepts valid URL", () => {
    expect(urlSchema.parse("https://example.com")).toBe("https://example.com");
  });

  it("accepts URL with path and query", () => {
    expect(urlSchema.parse("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
  });

  it("rejects plain text", () => {
    expect(() => urlSchema.parse("not a url")).toThrow();
  });

  it("rejects empty string", () => {
    expect(() => urlSchema.parse("")).toThrow();
  });
});
