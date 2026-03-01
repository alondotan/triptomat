import { z } from 'zod';

const expenseCategories = ['food', 'transport', 'accommodation', 'attraction', 'shopping', 'communication', 'insurance', 'tips', 'other'] as const;

export const createExpenseSchema = z.object({
  description: z.string().min(1, "Description is required").max(500),
  category: z.enum(expenseCategories),
  amount: z.number().positive("Amount must be positive"),
  currency: z.string().length(3, "Currency must be 3 letters"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional(),
  notes: z.string().max(5000).optional(),
});
