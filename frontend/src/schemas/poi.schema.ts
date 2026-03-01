import { z } from 'zod';

const poiCategories = ['accommodation', 'eatery', 'attraction', 'service'] as const;
const poiStatuses = ['candidate', 'in_plan', 'matched', 'booked', 'visited'] as const;

export const createPOISchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  category: z.enum(poiCategories),
  status: z.enum(poiStatuses),
  subCategory: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  costAmount: z.number().positive("Cost must be positive").optional(),
  costCurrency: z.string().length(3, "Currency must be 3 letters").optional(),
  notes: z.string().max(5000).optional(),
});
