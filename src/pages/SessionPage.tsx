import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft, Dumbbell } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { ExerciseBlock } from '@/domains/sessions/components/ExerciseBlock';
import { AddExerciseSheet } from '@/domains/sessions/components/AddExerciseSheet';
import {
  useActiveSession,
  useSessionExercises,
  useAddExerciseToSession,
  useReorderSessionExercises,
} from '@/domains/sessions/hooks/useActiveSession';
import { useTouchDragDrop } from '@/domains/sessions/hooks/useTouchDragDrop';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import type { Exercise } from '@/types/entities';
import { clsx } from 'clsx';
import { getExercisesByIds, getMuscleGroupsByIds, getSetsForSessionExercise } from '@/lib/api';
import { calculateTotalVolume } from '@/lib/volumeCalculator';

export function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [draggedExerciseId, setDraggedExerciseId] = useState<string | null>(null);
  const [dragOverExerciseId, setDragOverExerciseId] = useState<string | null>(null);

  // Global refetch is handled by App.tsx after Zustand rehydration

  const sessionQuery = useActiveSession(id!);
  const sessionExercisesQuery = useSessionExercises(id!);
  const session = sessionQuery.data;
  const sessionExercises = sessionExercisesQuery.data;
  const addExercise = useAddExerciseToSession();
  const reorder = useReorderSessionExercises();
  const touchDragDrop = useTouchDragDrop((sourceId, targetId) => reorder.mutate({ sourceId, targetId }));

  const exerciseIdsKey = useMemo(
    () => (sessionExercises ?? []).map((se) => se.exerciseId).sort().join(','),
    [sessionExercises],
  );

  const sessionMetadataQuery = useQuery({
    queryKey: ['sessionMetadata', user?.id, id, exerciseIdsKey],
    queryFn: async () => {
      const exerciseIds = (sessionExercises ?? []).map((se) => se.exerciseId);
      // After a hard refresh we only reload the metadata required by the
      // current session instead of depending on the whole exercise catalog.
      const exercises = await getExercisesByIds(user!.id, exerciseIds);
      const muscleGroupIds = exercises.map((exercise) => exercise.muscleGroupId);
      const muscleGroups = await getMuscleGroupsByIds(user!.id, muscleGroupIds);
      return { exercises, muscleGroups };
    },
    enabled: !!user?.id && !!sessionExercises,
    staleTime: 1000 * 60 * 5,
  });

  const exercises = sessionMetadataQuery.data?.exercises;
  const muscleGroups = sessionMetadataQuery.data?.muscleGroups;

  const exerciseMap = useMemo(
    () => new Map(exercises?.map((e) => [e.id, e]) ?? []),
    [exercises],
  );
  const mgMap = useMemo(
    () => new Map(muscleGroups?.map((mg) => [mg.id, mg]) ?? []),
    [muscleGroups],
  );

  // Keep the same user-scoped cache keys as the session hooks so refresh and
  // invalidation stay consistent across SessionPage, CalendarPage and mutations.
  const setQueries = useQueries({
    queries: (sessionExercises ?? []).map((se) => ({
      queryKey: ['sets', user?.id, se.id],
      queryFn: () => getSetsForSessionExercise(se.id),
    })),
  });

  const totalSetsCount = useMemo(
    () => setQueries.reduce((n, q) => n + (q.data?.length ?? 0), 0),
    [setQueries],
  );

  const totalVolume = useMemo(() => {
    if (!sessionExercises) return 0;
    let total = 0;
    for (let i = 0; i < sessionExercises.length; i++) {
      const ex = exerciseMap.get(sessionExercises[i].exerciseId);
      if (ex?.type !== 'weight_reps') continue;
      total += calculateTotalVolume(setQueries[i]?.data ?? [], ex.type);
    }
    return total;
  }, [sessionExercises, setQueries, exerciseMap]);

  async function handleAddExercise(exercise: Exercise) {
    if (!id) return;
    await addExercise.mutateAsync({
      sessionId: id,
      exerciseId: exercise.id,
      order: (sessionExercises?.length ?? 0) + 1,
    });
  }

  async function handleExerciseDrop(targetSessionExerciseId: string) {
    if (!draggedExerciseId || draggedExerciseId === targetSessionExerciseId) {
      setDraggedExerciseId(null);
      setDragOverExerciseId(null);
      return;
    }
    await reorder.mutateAsync({ sourceId: draggedExerciseId, targetId: targetSessionExerciseId });
    setDraggedExerciseId(null);
    setDragOverExerciseId(null);
  }

  const existingExerciseIds = sessionExercises?.map((se) => se.exerciseId) ?? [];

  const isPageLoading =
    (sessionQuery.fetchStatus === 'fetching' && !sessionQuery.data && !sessionQuery.error) ||
    (sessionExercisesQuery.fetchStatus === 'fetching' && !sessionExercisesQuery.data && !sessionExercisesQuery.error) ||
    (((sessionExercises?.length ?? 0) > 0) && sessionMetadataQuery.fetchStatus === 'fetching' && !sessionMetadataQuery.data && !sessionMetadataQuery.error);

  const pageError =
    sessionQuery.error ||
    sessionExercisesQuery.error ||
    sessionMetadataQuery.error;

  async function handleRetry() {
    await queryClient.invalidateQueries({ queryKey: ['session', user?.id, id] });
    await queryClient.invalidateQueries({ queryKey: ['sessionExercises', user?.id, id] });
    await queryClient.invalidateQueries({ queryKey: ['sessionMetadata', user?.id, id] });
    await queryClient.refetchQueries({ queryKey: ['session', user?.id, id] });
    await queryClient.refetchQueries({ queryKey: ['sessionExercises', user?.id, id] });
    await queryClient.refetchQueries({ queryKey: ['sessionMetadata', user?.id, id] });
  }

  if (isPageLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-surface-base">
        <div className="flex flex-col items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-accent animate-bounce" />
          <span className="text-sm text-text-secondary">Chargement…</span>
        </div>
      </div>
    );
  }

  if (pageError) {
    const message = pageError instanceof Error && pageError.message
      ? pageError.message
      : 'Impossible de recharger la seance.';

    return (
      <div className="flex items-center justify-center min-h-dvh bg-surface-base px-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-border bg-surface-card p-6 text-center shadow-card">
          <div className="h-14 w-14 rounded-2xl bg-surface-raised flex items-center justify-center">
            <Dumbbell size={24} className="text-text-secondary" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-text-primary">Seance indisponible</p>
            <p className="text-sm text-text-secondary">{message}</p>
          </div>
          <div className="flex w-full gap-3">
            <Button variant="secondary" fullWidth onClick={() => navigate('/', { replace: true })}>
              Retour au planning
            </Button>
            <Button fullWidth onClick={() => void handleRetry()}>
              Reessayer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-surface-base px-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-border bg-surface-card p-6 text-center shadow-card">
          <div className="h-14 w-14 rounded-2xl bg-surface-raised flex items-center justify-center">
            <Dumbbell size={24} className="text-text-secondary" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-text-primary">Seance introuvable</p>
            <p className="text-sm text-text-secondary">La page a ete rechargee mais la seance n'a pas pu etre retrouvee.</p>
          </div>
          <Button fullWidth onClick={() => navigate('/', { replace: true })}>
            Retour au planning
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-surface-base overflow-hidden">
      <header className="sticky top-0 z-30 bg-nav border-b border-border safe-top flex-shrink-0">
        <div className="flex items-center gap-3 px-3 h-14">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 flex items-center justify-center rounded-xl text-text-secondary active:bg-surface-raised transition-colors duration-fast flex-shrink-0"
          >
            <ArrowLeft size={20} strokeWidth={1.75} />
          </button>

          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-text-primary block truncate">
              {session.date
                ? format(new Date(session.date + 'T00:00:00'), 'EEEE, MMM d')
                : 'Séance'}
            </span>
            {(sessionExercises?.length ?? 0) > 0 && (
              <span className="text-xs text-text-secondary">
                {sessionExercises!.length} exercice{sessionExercises!.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {totalSetsCount > 0 && (
              <span className="primary-pill">{totalSetsCount} sets</span>
            )}
            {totalVolume > 0 && (
              <span className="primary-pill">
                {totalVolume.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto py-2">
        {(sessionExercises?.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-4 py-20 px-8 text-center">
            <div className="h-20 w-20 rounded-3xl bg-surface-card border border-border/60 flex items-center justify-center shadow-card">
              <Dumbbell size={32} className="text-text-muted" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold text-text-primary">Aucun exercice</p>
              <p className="text-sm text-text-secondary leading-relaxed">
                Appuie sur le bouton ci-dessous<br />pour démarrer ta séance.
              </p>
            </div>
          </div>
        )}

        {sessionExercises?.map((se) => {
          const exercise = exerciseMap.get(se.exerciseId);
          if (!exercise) return null;
          return (
            <ExerciseBlock
              key={se.id}
              sessionExercise={se}
              exercise={exercise}
              muscleGroup={mgMap.get(exercise.muscleGroupId)}
              onDragStart={(eid, e) => {
                setDraggedExerciseId(eid);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', eid);
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOverExerciseId(se.id); }}
              onDragLeave={() => setDragOverExerciseId(null)}
              onDrop={(eid, e) => { e.preventDefault(); e.stopPropagation(); handleExerciseDrop(eid); }}
              isDragOver={dragOverExerciseId === se.id}
              onGripTouchStart={(eid, e) => touchDragDrop.handleGripTouchStart(e, eid)}
              isTouchDraggedOver={
                touchDragDrop.state.draggedId !== null &&
                touchDragDrop.state.dragOverId === se.id
              }
            />
          );
        })}

        <div className="h-4" />
      </div>

      <div className="sticky bottom-0 pb-safe pt-2 px-4 bg-fade-up">
        <button
          onClick={() => setAddExerciseOpen(true)}
          className={clsx(
            'w-full flex items-center justify-center gap-2.5 h-13 rounded-2xl',
            'bg-primary text-white font-semibold text-sm',
            'shadow-accent-glow',
            'active:bg-primary-pressed active:scale-97 transition-all duration-fast',
          )}
          style={{ height: '52px' }}
        >
          <Plus size={20} strokeWidth={2.5} />
          Ajouter un exercice
        </button>
      </div>

      <AddExerciseSheet
        isOpen={addExerciseOpen}
        onClose={() => setAddExerciseOpen(false)}
        onSelect={handleAddExercise}
        excludeIds={existingExerciseIds}
      />
    </div>
  );
}
