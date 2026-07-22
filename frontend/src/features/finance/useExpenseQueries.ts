/**
 * TanStack Query hooks for the Expense domain.
 *
 * Replaces the manual `useReducer` + `useEffect` pattern for expenses in
 * FinanceContext. Adds realtime subscription (was previously missing — minor
 * behaviour upgrade for multi-device trips).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Expense } from '@/types/trip';
import {
  fetchExpenses,
  createExpense as createExpenseService,
  updateExpense as updateExpenseService,
  deleteExpense as deleteExpenseService,
} from '@/features/finance/expenseService';
import { useTripCollection } from '@/shared/queries/useTripCollection';
import { queryKeys } from '@/shared/queries/keys';
import { useToast } from '@/shared/hooks/use-toast';

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function useExpenses(tripId: string | undefined) {
  return useTripCollection<Expense>({
    tripId,
    table: 'expenses',
    queryKey: queryKeys.finance.expenses(tripId ?? ''),
    fetcher: () => fetchExpenses(tripId!),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useAddExpense(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (e: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => createExpenseService(e),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all(tripId ?? '') });
    },
    onError: (error) => {
      console.error('Failed to add expense:', error);
      toast({ title: 'Error', description: 'Failed to add expense.', variant: 'destructive' });
    },
  });
}

export function useUpdateExpense(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Expense> }) =>
      updateExpenseService(id, updates),
    onMutate: async ({ id, updates }) => {
      const key = queryKeys.finance.expenses(tripId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Expense[]>(key);
      queryClient.setQueryData<Expense[]>(key, (old) =>
        (old ?? []).map((e) => (e.id === id ? { ...e, ...updates } : e)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.finance.expenses(tripId ?? ''), context.previous);
      }
      console.error('Failed to update expense:', error);
      toast({ title: 'Error', description: 'Failed to update expense.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all(tripId ?? '') });
    },
  });
}

export function useDeleteExpense(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteExpenseService(id),
    onMutate: async (id) => {
      const key = queryKeys.finance.expenses(tripId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Expense[]>(key);
      queryClient.setQueryData<Expense[]>(key, (old) => (old ?? []).filter((e) => e.id !== id));
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.finance.expenses(tripId ?? ''), context.previous);
      }
      console.error('Failed to delete expense:', error);
      toast({ title: 'Error', description: 'Failed to delete expense.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all(tripId ?? '') });
    },
  });
}
