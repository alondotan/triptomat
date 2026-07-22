/**
 * TanStack Query hooks for the Missions domain.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mission } from '@/types/trip';
import {
  fetchMissions,
  createMission as createMissionService,
  updateMission as updateMissionService,
  deleteMission as deleteMissionService,
} from '@/features/missions/missionService';
import { useTripCollection } from '@/shared/queries/useTripCollection';
import { queryKeys } from '@/shared/queries/keys';
import { useToast } from '@/shared/hooks/use-toast';

export function useMissions(tripId: string | undefined) {
  return useTripCollection<Mission>({
    tripId,
    table: 'missions',
    queryKey: queryKeys.missions.list(tripId ?? ''),
    fetcher: () => fetchMissions(tripId!),
  });
}

export function useAddMission(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (m: Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>) => createMissionService(m),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.missions.all(tripId ?? '') });
    },
    onError: (error) => {
      console.error('Failed to add mission:', error);
      toast({ title: 'Error', description: 'Failed to add mission.', variant: 'destructive' });
    },
  });
}

export function useUpdateMission(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Mission> }) =>
      updateMissionService(id, updates),
    onMutate: async ({ id, updates }) => {
      const key = queryKeys.missions.list(tripId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Mission[]>(key);
      queryClient.setQueryData<Mission[]>(key, (old) =>
        (old ?? []).map((m) => (m.id === id ? { ...m, ...updates } : m)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.missions.list(tripId ?? ''), context.previous);
      }
      console.error('Failed to update mission:', error);
      toast({ title: 'Error', description: 'Failed to update mission.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.missions.all(tripId ?? '') });
    },
  });
}

export function useDeleteMission(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteMissionService(id),
    onMutate: async (id) => {
      const key = queryKeys.missions.list(tripId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Mission[]>(key);
      queryClient.setQueryData<Mission[]>(key, (old) => (old ?? []).filter((m) => m.id !== id));
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.missions.list(tripId ?? ''), context.previous);
      }
      console.error('Failed to delete mission:', error);
      toast({ title: 'Error', description: 'Failed to delete mission.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.missions.all(tripId ?? '') });
    },
  });
}
