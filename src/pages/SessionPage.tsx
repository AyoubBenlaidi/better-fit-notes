import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft, Dumbbell } from 'lucide-react';
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { ExerciseBlock } from '@/domains/sessions/components/ExerciseBlock';
import { AddExerciseSheet } from '@/domains/sessions/components/AddExerciseSheet';
import {
  useActiveSession,
  useSessionExercises,
  useAddExerciseToSession,
  useReorderSessionExercises,
} from '@/domains/sessions/hooks/useActiveSession';
import { useTouchDragDrop } from '@/domains/sessions/hooks/useTouchDragDrop';
import type { Exercise } from '@/types/entities';
import { clsx } from 'clsx';
import { db } from '@/db/schema';
import { useMemo } from 'react';
import { calculateTotalVolume } from '@/lib/volumeCalculator';

export function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [draggedExerciseId, setDraggedExerciseId] = useState<string | null>(null);
  const [dragOverExerciseId, setDragOverExerciseId] = useState<string | null>(null);

  const session = useActiveSession(id!);
  const sessionExercises = useSessionExercises(id!);
  const addExercise = useAddExerciseToSession();
  const reorder = useReorderSessionExercises();
  const touchDragDrop = useTouchDragDrop((sourceId, targetId) => {
    reorder.mutate({ sourceId, targetId });
  });

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

  const sessionExerciseIds = useMemo(
    () => sessionExercises?.map((se) => se.id) ?? [],
    [sessionExercises],
  );

  const allSessionSets = useLiveQuery(
    async () => {
      if (sessionExerciseIds.length === 0) return [];
      return db.sets.where('sessionExerciseId').anyOf(sessionExerciseIds).toArray();
    },
    [sessionExerciseIds.join(',')],
  );

  const sessionExercisesWithData = useLiveQuery(
    async () => {
      if (!sessionExercises) return [];
      const exerciseIds = sessionExercises.map((se) => se.exerciseId);
      if (exerciseIds.length === 0) return [];
      const exercises = await db.exercises.where('id').anyOf(exerciseIds).toArray();
      const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
      return sessionExercises.map((se) => ({ ...se, exercise: exerciseMap.get(se.exerciseId) }));
    },
    [sessionExercises?.map((se) => se.id).join(',')],
  );

  const totalVolume = useMemo(() => {
    let total = 0;
    if (!sessionExercisesWithData || !allSessionSets) return total;
    for (const se of sessionExercisesWithData) {
      if (se.exercise?.type !== 'weight_reps') continue;
      const setsForExercise = allSessionSets.filter((s) => s.sessionExerciseId === se.id);
      total += calculateTotalVolume(setsForExercise, se.exercise.type);
    }
    return total;
  }, [sessionExercisesWithData, allSessionSets]);

  const totalSetsCount = useMemo(
    () => allSessionSets?.length ?? 0,
    [allSessionSets],
  );

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-surface-base">
        <div className="flex flex-col items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-accent animate-bounce" />
          <span className="text-sm text-text-secondary">Chargement…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-surface-base overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────────────── */}
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

          {/* Stats pills */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {totalSetsCount > 0 && (
              <span className="primary-pill">
                {totalSetsCount} sets
              </span>
            )}
            {totalVolume > 0 && (
              <span className="primary-pill">
                {totalVolume.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── Exercise blocks ───────────────────────────────────────────────── */}
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

        {sessionExercises?.map((se) => (
          <ExerciseBlock
            key={se.id}
            sessionExercise={se}
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
        ))}

        {/* Bottom spacing for FAB */}
        <div className="h-4" />
      </div>

      {/* ── Add exercise FAB ──────────────────────────────────────────────── */}
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
