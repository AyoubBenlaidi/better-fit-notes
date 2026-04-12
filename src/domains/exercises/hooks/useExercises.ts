import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import type { Exercise, MuscleGroup } from '@/types/entities';
import {
  getMuscleGroups, getExercises, createExercise, updateExercise,
  deleteExercise, updateMuscleGroupColor,
} from '@/lib/api';
import { toast } from '@/components/ui/Toast';

export function useMuscleGroups() {
  const { user } = useAuthStore();
  const { data } = useQuery({
    queryKey: ['muscleGroups', user?.id],
    queryFn: () => getMuscleGroups(user!.id),
    enabled: !!user,
    staleTime: Infinity,
  });
  return data;
}

export function useExercises(filters?: { muscleGroupId?: string; search?: string }) {
  const { user } = useAuthStore();
  const { data } = useQuery({
    queryKey: ['exercises', user?.id],
    queryFn: () => getExercises(user!.id),
    enabled: !!user,
    staleTime: Infinity,
  });

  if (!data) return undefined;

  return data.filter((ex) => {
    if (filters?.muscleGroupId && ex.muscleGroupId !== filters.muscleGroupId) return false;
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      if (!ex.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export function useExercise(id: string) {
  const { user } = useAuthStore();
  const { data } = useQuery({
    queryKey: ['exercises', user?.id],
    queryFn: () => getExercises(user!.id),
    enabled: !!user,
    staleTime: Infinity,
  });
  return data?.find((ex) => ex.id === id);
}

export function useCreateExercise() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: (data: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'isCustom'>) =>
      createExercise(user!.id, { ...data, isCustom: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises', user?.id] });
      toast('Exercise created', 'success');
    },
    onError: (err) => toast((err as Error).message, 'error'),
  });
}

export function useUpdateExercise() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Exercise> & { id: string }) =>
      updateExercise(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises', user?.id] });
      toast('Exercise updated', 'success');
    },
    onError: (err) => toast((err as Error).message, 'error'),
  });
}

export function useDeleteExercise() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: (id: string) => deleteExercise(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises', user?.id] });
      toast('Exercise deleted', 'success');
    },
    onError: (err) => toast((err as Error).message, 'error'),
  });
}

export function useUpdateMuscleGroup() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: ({ id, color }: { id: string; color: string }) =>
      updateMuscleGroupColor(id, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['muscleGroups', user?.id] });
      toast('Color updated', 'success');
    },
    onError: (err) => toast((err as Error).message, 'error'),
  });
}

export function groupExercisesByMuscle(
  exercises: Exercise[],
  muscleGroups: MuscleGroup[],
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
