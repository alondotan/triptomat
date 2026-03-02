import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// Base schema — fields always required
const baseTripSchema = z.object({
  name: z.string().min(1, "Trip name is required").max(255),
  description: z.string().max(5000).optional(),
  countries: z.array(z.string()).min(1, "At least one country required"),
});

// Research: no dates, no duration
export const createTripResearchSchema = baseTripSchema;

// Planning: numberOfDays required
export const createTripPlanningSchema = baseTripSchema.extend({
  numberOfDays: z.number().int().min(1, "Must be at least 1 day").max(365),
});

// Detailed planning: start + end dates required
export const createTripDetailedSchema = baseTripSchema.extend({
  startDate: z.string().regex(dateRegex, "Invalid date format"),
  endDate: z.string().regex(dateRegex, "Invalid date format"),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date must be on or after start date",
  path: ["endDate"],
});

// Legacy: used by existing code that still references createTripSchema
export const createTripSchema = createTripDetailedSchema;
