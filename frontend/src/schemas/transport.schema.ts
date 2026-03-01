import { z } from 'zod';

const transportCategories = ['flight', 'train', 'bus', 'ferry', 'taxi', 'car_rental', 'other'] as const;
const transportStatuses = ['candidate', 'in_plan', 'booked', 'completed'] as const;

const segmentSchema = z.object({
  fromName: z.string().min(1, "Departure location is required").max(255),
  fromCode: z.string().max(10).optional(),
  toName: z.string().min(1, "Destination is required").max(255),
  toCode: z.string().max(10).optional(),
  departureTime: z.string().optional(),
  arrivalTime: z.string().optional(),
  flightNumber: z.string().max(20).optional(),
});

export const createTransportSchema = z.object({
  category: z.enum(transportCategories),
  status: z.enum(transportStatuses),
  segments: z.array(segmentSchema).min(1, "At least one segment required"),
  carrierName: z.string().max(255).optional(),
  orderNumber: z.string().max(100).optional(),
  costAmount: z.number().nonnegative("Cost cannot be negative").optional(),
  costCurrency: z.string().length(3, "Currency must be 3 letters").optional(),
  notes: z.string().max(5000).optional(),
});
