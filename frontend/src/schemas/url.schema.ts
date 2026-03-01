import { z } from 'zod';

export const urlSchema = z.string().url("Please enter a valid URL");
