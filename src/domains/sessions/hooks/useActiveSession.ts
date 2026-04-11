import { useLiveQuery } from 'dexie-react-hooks';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/db/schema';
import type { WorkoutSet, SessionExercise } from '@/types/entities';
import { enqueueSync } from '@/lib/sync';
import { toast } from '@/components/ui/Toast';

export function useActiveSession(sessionId: string) {
  return useLiveQuery(() => db.sessions.get(sessionId), [sessionId]);
}

export function useSessionExercises(sessionId: string) {
  return useLiveQuery(
    () => db.sessionExercises.where('sessionId').equals(sessionId).sortBy('order'),
    [sessionId]
  );
}

export function useSetsForSessionExercise(sessionExerciseId: string) {
  return useLiveQuery(
    () => db.sets.where('sessionExerciseId').equals(sessionExerciseId).sortBy('order'),
    [sessionExerciseId]
  );
}

export function useAddExerciseToSession() {
  return useMutation({
    mutationFn: async ({
      sessionId,
      exerciseId,
      order,
    }: {
      sessionId: string;
      exerciseId: string;
      order: number;
    }) => {
      const now = new Date();
      const se: SessionExercise = {
        id: crypto.randomUUID(),
        sessionId,
        exerciseId,
        order,
        createdAt: now,
        updatedAt: now,
      };
      await db.sessionExercises.add(se);
      await enqueueSync('sessionExercises', 'create', se.id, se);

      // Add one empty set
      const set: WorkoutSet = {
        id: crypto.randomUUID(),
        sessionExerciseId: se.id,
        order: 1,
        isWarmup: false,
        createdAt: now,
        updatedAt: now,
      };
      await db.sets.add(set);
      await enqueueSync('sets', 'create', set.id, set);

      return se;
    },
  });
}

export function useRemoveExerciseFromSession() {
  return useMutation({
    mutationFn: async (sessionExerciseId: string) => {
      await db.sets.where('sessionExerciseId').equals(sessionExerciseId).delete();
      await db.sessionExercises.delete(sessionExerciseId);
      await enqueueSync('sessionExercises', 'delete', sessionExerciseId, { id: sessionExerciseId });
    },
  });
}

export function useAddSet() {
  return useMutation({
    mutationFn: async ({
      sessionExerciseId,
      fromSet,
      order,
    }: {
      sessionExerciseId: string;
      fromSet?: WorkoutSet;
      order: number;
    }) => {
      const now = new Date();
      const set: WorkoutSet = {
        id: crypto.randomUUID(),
        sessionExerciseId,
        order,
        weight: fromSet?.weight,
        reps: fromSet?.reps,
        isWarmup: false,
        createdAt: now,
        updatedAt: now,
      };
      await db.sets.add(set);
      await enqueueSync('sets', 'create', set.id, set);
      return set;
    },
  });
}

export function useUpdateSet() {
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<WorkoutSet> & { id: string }) => {
      await db.sets.update(id, { ...data, updatedAt: new Date() });
      const set = await db.sets.get(id);
      if (set) await enqueueSync('sets', 'update', id, set);
      return set;
    },
  });
}

export function useDeleteSet() {
  return useMutation({
    mutationFn: async (id: string) => {
      await db.sets.delete(id);
      await enqueueSync('sets', 'delete', id, { id });
    },
  });
}

export function useReorderSessionExercises() {
  return useMutation({
    mutationFn: async ({
      sourceId,
      targetId,
    }: {
      sourceId: string;
      targetId: string;
    }) => {
      const source = await db.sessionExercises.get(sourceId);
      const target = await db.sessionExercises.get(targetId);

      if (!source || !target) return;

      // Swap orders
      const sourceOrder = source.order;
      const targetOrder = target.order;

      await db.sessionExercises.update(sourceId, { order: targetOrder });
      await db.sessionExercises.update(targetId, { order: sourceOrder });

      // Sync
      const updatedSource = await db.sessionExercises.get(sourceId);
      const updatedTarget = await db.sessionExercises.get(targetId);
      if (updatedSource) await enqueueSync('sessionExercises', 'update', sourceId, updatedSource);
      if (updatedTarget) await enqueueSync('sessionExercises', 'update', targetId, updatedTarget);
    },
  });
}

export function useFinishSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const now = new Date();
      await db.sessions.update(sessionId, {
        finishedAt: now,
        updatedAt: now,
      });

      // Compute personal records
      await computePersonalRecords(sessionId);

      const session = await db.sessions.get(sessionId);
      if (session) await enqueueSync('sessions', 'update', sessionId, session);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast('Workout saved!', 'success');
    },
    onError: (err) => {
      toast((err as Error).message, 'error');
    },
  });
}

async function computePersonalRecords(sessionId: string) {
  const session = await db.sessions.get(sessionId);
  if (!session) return;

  const sessionExercises = await db.sessionExercises
    .where('sessionId')
    .equals(sessionId)
    .toArray();

  for (const se of sessionExercises) {
    const sets = await db.sets
      .where('sessionExerciseId')
      .equals(se.id)
      .toArray();

    const completedSets = sets.filter((s) => s.completedAt);
    if (completedSets.length === 0) continue;

    const exercise = await db.exercises.get(se.exerciseId);
    if (!exercise) continue;

    // Max weight
    const weights = completedSets.map((s) => s.weight ?? 0).filter((w) => w > 0);
    if (weights.length > 0) {
      const maxWeight = Math.max(...weights);
      await upsertPR(se.exerciseId, 'max_weight', maxWeight, sessionId, session.date);
    }

    // Max reps in a single set
    const reps = completedSets.map((s) => s.reps ?? 0).filter((r) => r > 0);
    if (reps.length > 0) {
      const maxReps = Math.max(...reps);
      await upsertPR(se.exerciseId, 'max_reps', maxReps, sessionId, session.date);
    }

    // Total volume (weight × reps summed)
    const volume = completedSets.reduce((acc, s) => acc + (s.weight ?? 0) * (s.reps ?? 0), 0);
    if (volume > 0) {
      await upsertPR(se.exerciseId, 'max_volume', volume, sessionId, session.date);
    }
  }
}

async function upsertPR(
  exerciseId: string,
  type: 'max_weight' | 'max_reps' | 'max_volume' | 'max_distance' | 'max_duration',
  value: number,
  sessionId: string,
  date: string
) {
  const existing = await db.personalRecords
    .where('[exerciseId+type]')
    .equals([exerciseId, type])
    .first();

  if (!existing || value > existing.value) {
    const pr = {
      id: existing?.id ?? crypto.randomUUID(),
      exerciseId,
      type,
      value,
      sessionId,
      date,
      createdAt: new Date(),
    };
    if (existing) {
      await db.personalRecords.update(existing.id, pr);
    } else {
      await db.personalRecords.add(pr);
    }

    // Haptic for PR!
    if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
  }
}
