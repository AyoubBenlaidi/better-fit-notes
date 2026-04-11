import { useLiveQuery } from 'dexie-react-hooks';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/db/schema';
import type { Exercise, MuscleGroup } from '@/types/entities';
import { enqueueSync } from '@/lib/sync';
import { toast } from '@/components/ui/Toast';

export function useMuscleGroups() {
  return useLiveQuery(() => db.muscleGroups.orderBy('name').toArray(), []);
}

export function useExercises(filters?: { muscleGroupId?: string; search?: string }) {
  return useLiveQuery(async () => {
    let query = db.exercises.orderBy('name');
    const results = await query.toArray();

    return results.filter((ex) => {
      if (filters?.muscleGroupId && ex.muscleGroupId !== filters.muscleGroupId) return false;
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        if (!ex.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [filters?.muscleGroupId, filters?.search]);
}

export function useExercise(id: string) {
  return useLiveQuery(() => db.exercises.get(id), [id]);
}

export function useCreateExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      data: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'isCustom'>
    ) => {
      const exercise: Exercise = {
        ...data,
        id: crypto.randomUUID(),
        isCustom: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.exercises.add(exercise);
      await enqueueSync('exercises', 'create', exercise.id, exercise);
      return exercise;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      toast('Exercise created', 'success');
    },
    onError: (err) => {
      toast((err as Error).message, 'error');
    },
  });
}

export function useUpdateExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Exercise> & { id: string }) => {
      const updated = { ...data, updatedAt: new Date() };
      await db.exercises.update(id, updated);
      const exercise = await db.exercises.get(id);
      if (exercise) await enqueueSync('exercises', 'update', id, exercise);
      return exercise;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      toast('Exercise updated', 'success');
    },
    onError: (err) => {
      toast((err as Error).message, 'error');
    },
  });
}

export function useDeleteExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Check if used in any session
      const usages = await db.sessionExercises.where('exerciseId').equals(id).count();
      if (usages > 0) {
        throw new Error('This exercise is used in past sessions and cannot be deleted.');
      }
      await db.exercises.delete(id);
      await enqueueSync('exercises', 'delete', id, { id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      toast('Exercise deleted', 'success');
    },
    onError: (err) => {
      toast((err as Error).message, 'error');
    },
  });
}

export function useUpdateMuscleGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, color }: { id: string; color: string }) => {
      await db.muscleGroups.update(id, { color });
      return { id, color };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['muscleGroups'] });
      toast('Color updated', 'success');
    },
    onError: (err) => {
      toast((err as Error).message, 'error');
    },
  });
}

export function groupExercisesByMuscle(
  exercises: Exercise[],
  muscleGroups: MuscleGroup[]
): { group: MuscleGroup; exercises: Exercise[] }[] {
  const mgMap = new Map(muscleGroups.map((mg) => [mg.id, mg]));
  const grouped = new Map<string, Exercise[]>();

  for (const ex of exercises) {
    const list = grouped.get(ex.muscleGroupId) ?? [];
    list.push(ex);
    grouped.set(ex.muscleGroupId, list);
  }

  return Array.from(grouped.entries())
    .map(([mgId, exs]) => ({ group: mgMap.get(mgId)!, exercises: exs }))
    .filter((g) => g.group)
    .sort((a, b) => a.group.name.localeCompare(b.group.name));
}
