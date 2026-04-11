import { useMemo, useState } from 'react';
import type { WorkoutSet } from '@/types/entities';
import { Plus, X, ChevronDown, GripVertical } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { SetRow } from './SetRow';
import {
  useSetsForSessionExercise,
  useAddSet,
  useRemoveExerciseFromSession,
} from '../hooks/useActiveSession';
import type { SessionExercise } from '@/types/entities';
import { calculateTotalVolume, formatVolume } from '@/lib/volumeCalculator';
import { clsx } from 'clsx';

interface ExerciseBlockProps {
  sessionExercise: SessionExercise;
  onDragStart?: (sessionExerciseId: string, e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (sessionExerciseId: string, e: React.DragEvent<HTMLDivElement>) => void;
  isDragOver?: boolean;
  onGripTouchStart?: (sessionExerciseId: string, e: React.TouchEvent) => void;
  isTouchDraggedOver?: boolean;
}

export function ExerciseBlock({
  sessionExercise,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
  onGripTouchStart,
  isTouchDraggedOver,
}: ExerciseBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sets = useSetsForSessionExercise(sessionExercise.id);
  const addSet = useAddSet();
  const removeExercise = useRemoveExerciseFromSession();

  const exercise = useLiveQuery(
    () => db.exercises.get(sessionExercise.exerciseId),
    [sessionExercise.exerciseId],
  );
  const muscleGroup = useLiveQuery(
    () => exercise ? db.muscleGroups.get(exercise.muscleGroupId) : undefined,
    [exercise?.muscleGroupId],
  );

  const lastSets = useLiveQuery(async () => {
    if (!sessionExercise.exerciseId) return [];
    const prevSEs = await db.sessionExercises
      .where('exerciseId')
      .equals(sessionExercise.exerciseId)
      .and((se) => se.id !== sessionExercise.id)
      .toArray();
    if (prevSEs.length === 0) return [];
    const seIds = prevSEs.map((se) => se.id);
    return db.sets.where('sessionExerciseId').anyOf(seIds).toArray();
  }, [sessionExercise.id, sessionExercise.exerciseId]);

  const lastSetMap = useMemo(() => {
    const map = new Map<number, WorkoutSet>();
    if (!lastSets) return map;
    for (const s of lastSets) {
      if (!map.has(s.order) || (map.get(s.order)?.order ?? 0) < s.order) {
        map.set(s.order, s);
      }
    }
    return map;
  }, [lastSets]);

  const totalVolume = useMemo(() => {
    if (!sets || !exercise) return 0;
    return calculateTotalVolume(sets, exercise.type);
  }, [sets, exercise]);

  const completedSets = useMemo(
    () => sets?.filter((s) => s.completedAt).length ?? 0,
    [sets],
  );
  const totalSets = sets?.length ?? 0;

  function handleAddSet() {
    const lastSet = sets?.[sets.length - 1];
    addSet.mutate({
      sessionExerciseId: sessionExercise.id,
      fromSet: lastSet,
      order: (sets?.length ?? 0) + 1,
    });
  }

  if (!exercise) return null;

  const accentColor = muscleGroup?.color ?? '#4F7FFA';

  return (
    <div
      draggable
      data-se-id={sessionExercise.id}
      onDragStart={(e) => onDragStart?.(sessionExercise.id, e)}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver?.(e); }}
      onDragLeave={(e) => { if ((e.target as HTMLElement) === e.currentTarget) onDragLeave?.(e); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop?.(sessionExercise.id, e); }}
      className={clsx(
        'relative bg-surface-card rounded-2xl mx-3 my-2',
        'border border-border/60 overflow-hidden',
        'transition-all duration-medium',
        (isDragOver || isTouchDraggedOver) && 'ring-2 ring-accent/40 shadow-accent-glow scale-[1.01]',
      )}
    >
      {/* Left muscle-group accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
        style={{ backgroundColor: accentColor, opacity: 0.8 }}
      />

      {/* Exercise header */}
      <div className="flex items-center gap-2 pl-4 pr-3 pt-3 pb-2.5">
        {/* Drag handle */}
        <div
          className="cursor-move text-text-muted flex-shrink-0 -ml-1 touch-none"
          onTouchStart={(e) => onGripTouchStart?.(sessionExercise.id, e)}
        >
          <GripVertical size={15} strokeWidth={1.5} />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex-shrink-0 text-text-secondary active:bg-surface-raised rounded-lg p-0.5 transition-transform duration-medium"
          style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
        >
          <ChevronDown size={15} strokeWidth={2} />
        </button>

        {/* Exercise info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-text-primary truncate">{exercise.name}</h3>
            {totalVolume > 0 && (
              <span className="primary-pill">
                {formatVolume(totalVolume, exercise.type)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {totalSets > 0 && (
              <span className="text-[11px] text-text-muted font-mono">
                {completedSets}/{totalSets} sets
              </span>
            )}
          </div>
        </div>

        {/* Remove button */}
        <button
          onClick={() => removeExercise.mutate(sessionExercise.id)}
          className="h-8 w-8 rounded-xl flex items-center justify-center text-text-muted active:bg-surface-raised active:text-danger transition-colors duration-fast flex-shrink-0"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Sets content */}
      {!isCollapsed && (
        <>
          {/* Column headers */}
          <div className="flex items-center gap-2 px-4 pb-1">
            <div className="w-4 flex-shrink-0" />
            <div className="w-12 flex-shrink-0 text-center text-[10px] font-semibold text-text-muted uppercase tracking-wider">Prev</div>
            <div className="flex-1 text-center text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              {exercise.type === 'weight_reps' ? 'kg × Reps'
                : exercise.type === 'duration' ? 'Duration'
                : exercise.type === 'distance' ? 'Distance'
                : 'Reps'}
            </div>
            <div className="w-9 flex-shrink-0" />
            <div className="w-9 flex-shrink-0" />
          </div>

          {/* Set rows */}
          <div className="flex flex-col gap-0 pb-0">
            {sets?.map((set, i) => (
              <SetRow
                key={set.id}
                set={set}
                index={i}
                exerciseType={exercise.type}
                lastSet={lastSetMap.get(i + 1)}
                muscleGroupColor={accentColor}
              />
            ))}
          </div>

          {/* Add set button */}
          <button
            onClick={handleAddSet}
            className={clsx(
              'w-full flex items-center justify-center gap-2 py-3 mt-1',
              'text-sm font-semibold text-accent',
              'border-t border-border/40 rounded-b-2xl',
              'active:bg-surface-raised active:scale-97 transition-all duration-fast',
            )}
          >
            <Plus size={15} strokeWidth={2.5} />
            Add set
          </button>
        </>
      )}
    </div>
  );
}
