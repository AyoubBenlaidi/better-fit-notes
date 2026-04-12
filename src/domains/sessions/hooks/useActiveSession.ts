import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import type { WorkoutSet, SessionExercise } from '@/types/entities';
import {
  getSession, getSessionExercises, getSetsForSessionExercise,
  createSessionExercise, deleteSessionExercise,
  createSet, updateSet, deleteSet,
  updateSessionExercise, updateSession,
  computeAndSavePersonalRecords,
} from '@/lib/api';
import { toast } from '@/components/ui/Toast';

export function useActiveSession(sessionId: string) {
  const { data } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId),
    enabled: !!sessionId,
  });
  return data;
}

export function useSessionExercises(sessionId: string) {
  const { data } = useQuery({
    queryKey: ['sessionExercises', sessionId],
    queryFn: () => getSessionExercises(sessionId),
    enabled: !!sessionId,
  });
  return data;
}

export function useSetsForSessionExercise(sessionExerciseId: string) {
  const { data } = useQuery({
    queryKey: ['sets', sessionExerciseId],
    queryFn: () => getSetsForSessionExercise(sessionExerciseId),
    enabled: !!sessionExerciseId,
  });
  return data;
}

export function useAddExerciseToSession() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async ({ sessionId, exerciseId, order }: { sessionId: string; exerciseId: string; order: number }) => {
      const se = await createSessionExercise(user!.id, {
        id: crypto.randomUUID(), sessionId, exerciseId, order,
      });
      await createSet(user!.id, {
        id: crypto.randomUUID(), sessionExerciseId: se.id,
        order: 1, isWarmup: false,
      });
      return se;
    },
    onSuccess: (se) => {
      // ['sessionExercises', sessionId] is also used by CalendarPage — both get fresh data
      queryClient.invalidateQueries({ queryKey: ['sessionExercises', se.sessionId] });
      queryClient.invalidateQueries({ queryKey: ['sets', se.id] });
    },
  });
}

export function useRemoveExerciseFromSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionExerciseId: string) => {
      let sessionId: string | undefined;
      for (const [, data] of queryClient.getQueriesData<SessionExercise[]>({ queryKey: ['sessionExercises'] })) {
        if (Array.isArray(data)) {
          const found = data.find((se) => se.id === sessionExerciseId);
          if (found) { sessionId = found.sessionId; break; }
        }
      }
      await deleteSessionExercise(sessionExerciseId);
      return { sessionExerciseId, sessionId };
    },
    onSuccess: ({ sessionExerciseId, sessionId }) => {
      queryClient.removeQueries({ queryKey: ['sets', sessionExerciseId] });
      if (sessionId) queryClient.invalidateQueries({ queryKey: ['sessionExercises', sessionId] });
    },
  });
}

export function useAddSet() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: ({ sessionExerciseId, fromSet, order }: { sessionExerciseId: string; fromSet?: WorkoutSet; order: number }) =>
      createSet(user!.id, {
        id: crypto.randomUUID(), sessionExerciseId,
        order, weight: fromSet?.weight, reps: fromSet?.reps, isWarmup: false,
      }),
    onSuccess: (set) => {
      queryClient.invalidateQueries({ queryKey: ['sets', set.sessionExerciseId] });
    },
  });
}

export function useUpdateSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: Partial<WorkoutSet> & { id: string }) =>
      updateSet(id, data),
    onSuccess: (set) => {
      queryClient.invalidateQueries({ queryKey: ['sets', set.sessionExerciseId] });
    },
  });
}

export function useDeleteSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Find the set in cache to know its sessionExerciseId
      let sessionExerciseId: string | undefined;
      for (const [, data] of queryClient.getQueriesData<WorkoutSet[]>({ queryKey: ['sets'] })) {
        if (Array.isArray(data)) {
          const found = data.find((s) => s.id === id);
          if (found) { sessionExerciseId = found.sessionExerciseId; break; }
        }
      }
      await deleteSet(id);
      return sessionExerciseId;
    },
    onSuccess: (sessionExerciseId) => {
      if (sessionExerciseId) queryClient.invalidateQueries({ queryKey: ['sets', sessionExerciseId] });
    },
  });
}

export function useReorderSessionExercises() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      // Find both in cache
      let sessionId: string | undefined;
      let sourceOrder: number | undefined;
      let targetOrder: number | undefined;

      for (const [, data] of queryClient.getQueriesData<SessionExercise[]>({ queryKey: ['sessionExercises'] })) {
        if (!Array.isArray(data)) continue;
        const source = data.find((se) => se.id === sourceId);
        const target = data.find((se) => se.id === targetId);
        if (source && target) {
          sessionId = source.sessionId;
          sourceOrder = source.order;
          targetOrder = target.order;
          break;
        }
      }

      if (sourceOrder === undefined || targetOrder === undefined) return;

      await Promise.all([
        updateSessionExercise(sourceId, { order: targetOrder }),
        updateSessionExercise(targetId, { order: sourceOrder }),
      ]);
      return sessionId;
    },
    onSuccess: (sessionId) => {
      if (sessionId) queryClient.invalidateQueries({ queryKey: ['sessionExercises', sessionId] });
    },
  });
}

export function useFinishSession() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const now = new Date();
      await updateSession(sessionId, { finishedAt: now });
      await computeAndSavePersonalRecords(user!.id, sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['personalRecords', user?.id] });
      toast('Workout saved!', 'success');
    },
    onError: (err) => toast((err as Error).message, 'error'),
  });
}
