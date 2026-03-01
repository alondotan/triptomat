import { z } from 'zod';

export const createTripSchema = z.object({
  name: z.string().min(1, "Trip name is required").max(255),
  description: z.string().max(5000).optional(),
  countries: z.array(z.string()).min(1, "At least one country required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date must be on or after start date",
  path: ["endDate"],
});
