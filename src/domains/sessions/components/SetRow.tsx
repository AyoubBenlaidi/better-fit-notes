import { useRef } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { WorkoutSet } from '@/types/entities';
import { useUpdateSet, useDeleteSet } from '../hooks/useActiveSession';

interface SetRowProps {
  set: WorkoutSet;
  index: number;
  exerciseType: string;
  lastSet?: WorkoutSet;
  muscleGroupColor?: string;
}

export function SetRow({ set, index, exerciseType, lastSet, muscleGroupColor }: SetRowProps) {
  const updateSet = useUpdateSet();
  const deleteSet = useDeleteSet();

  const weightRef = useRef<HTMLInputElement>(null);
  const repsRef = useRef<HTMLInputElement>(null);
  const durationRef = useRef<HTMLInputElement>(null);
  const distanceRef = useRef<HTMLInputElement>(null);

  const isCompleted = !!set.completedAt;

  function handleWeightBlur(e: React.FocusEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val !== set.weight) {
      updateSet.mutate({ id: set.id, weight: val });
    }
  }

  function handleRepsBlur(e: React.FocusEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val !== set.reps) {
      updateSet.mutate({ id: set.id, reps: val });
    }
  }

  function handleDurationBlur(e: React.FocusEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val !== set.duration) {
      updateSet.mutate({ id: set.id, duration: val });
    }
  }

  function handleDistanceBlur(e: React.FocusEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val !== set.distance) {
      updateSet.mutate({ id: set.id, distance: val });
    }
  }

  function handleComplete() {
    if (isCompleted) {
      updateSet.mutate({ id: set.id, completedAt: undefined });
      return;
    }

    const updates: Partial<WorkoutSet> & { id: string } = { id: set.id, completedAt: new Date() };

    const w = weightRef.current?.value;
    if (w !== undefined && w !== '') { const n = parseFloat(w); if (!isNaN(n)) updates.weight = n; }

    const r = repsRef.current?.value;
    if (r !== undefined && r !== '') { const n = parseInt(r, 10); if (!isNaN(n)) updates.reps = n; }

    const d = durationRef.current?.value;
    if (d !== undefined && d !== '') { const n = parseInt(d, 10); if (!isNaN(n)) updates.duration = n; }

    const dist = distanceRef.current?.value;
    if (dist !== undefined && dist !== '') { const n = parseFloat(dist); if (!isNaN(n)) updates.distance = n; }

    updateSet.mutate(updates);
    if (navigator.vibrate) navigator.vibrate(10);
  }

  // Athletic Precision styling
  const inputClass = clsx(
    'bg-surface-raised border border-border rounded-xl',
    'text-center font-mono font-semibold text-text-primary text-base tabular-nums',
    'focus:outline-none focus:ring-1 focus:ring-accent focus:border-transparent',
    'transition-all duration-100',
    isCompleted ? 'text-accent opacity-60' : '',
    'placeholder:text-text-muted',
    'disabled:opacity-50 disabled:cursor-not-allowed'
  );

  return (
    <div className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-surface-raised/50 transition-colors">
      {/* Set number — monospace, left-aligned, 24px fixed width */}
      <div className="w-6 flex-shrink-0">
        <span className={clsx(
          'font-mono text-xs font-semibold',
          set.isWarmup ? 'text-accent' : 'text-text-muted'
        )}>
          {set.isWarmup ? 'W' : index + 1}
        </span>
      </div>

      {/* Previous performance — monospace, italicized, 48px fixed width */}
      <div className="w-12 flex-shrink-0">
        <span className="font-mono text-xs text-text-muted/60 italic tabular-nums">
          {exerciseType === 'weight_reps' && lastSet?.weight && lastSet?.reps
            ? `${lastSet.weight}×${lastSet.reps}`
            : exerciseType === 'bodyweight_reps' && lastSet?.reps
              ? `×${lastSet.reps}`
              : exerciseType === 'duration' && lastSet?.duration
                ? `${lastSet.duration}s`
                : exerciseType === 'distance' && lastSet?.distance
                  ? `${lastSet.distance}m`
                  : '–'}
        </span>
      </div>

      {/* weight_reps: kg × reps */}
      {exerciseType === 'weight_reps' && (
        <>
          <input
            ref={weightRef}
            type="number"
            inputMode="decimal"
            placeholder="0"
            defaultValue={set.weight ?? ''}
            onBlur={handleWeightBlur}
            className={clsx(inputClass, 'h-10 px-2 py-1.5 min-w-[56px]')}
            disabled={isCompleted}
          />
          <span className="text-text-muted text-xs font-light flex-shrink-0">×</span>
          <input
            ref={repsRef}
            type="number"
            inputMode="numeric"
            placeholder="0"
            defaultValue={set.reps ?? ''}
            onBlur={handleRepsBlur}
            className={clsx(inputClass, 'h-10 px-2 py-1.5 min-w-[44px]')}
            disabled={isCompleted}
          />
        </>
      )}

      {/* bodyweight_reps: reps only */}
      {exerciseType === 'bodyweight_reps' && (
        <input
          ref={repsRef}
          type="number"
          inputMode="numeric"
          placeholder="0"
          defaultValue={set.reps ?? ''}
          onBlur={handleRepsBlur}
          className={clsx(inputClass, 'h-10 px-2 py-1.5 min-w-[44px]')}
          disabled={isCompleted}
        />
      )}

      {/* duration */}
      {exerciseType === 'duration' && (
        <input
          ref={durationRef}
          type="number"
          inputMode="numeric"
          placeholder="0"
          defaultValue={set.duration ?? ''}
          onBlur={handleDurationBlur}
          className={clsx(inputClass, 'h-10 px-2 py-1.5 min-w-[56px]')}
          disabled={isCompleted}
        />
      )}

      {/* distance */}
      {exerciseType === 'distance' && (
        <input
          ref={distanceRef}
          type="number"
          inputMode="decimal"
          placeholder="0"
          defaultValue={set.distance ?? ''}
          onBlur={handleDistanceBlur}
          className={clsx(inputClass, 'h-10 px-2 py-1.5 min-w-[56px]')}
          disabled={isCompleted}
        />
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Complete button — 36×36px, bounce on check */}
      <button
        onClick={handleComplete}
        className={clsx(
          'h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0',
          'transition-all duration-100',
          isCompleted
            ? 'text-white animate-bounce-check'
            : 'bg-surface-overlay text-text-muted active:bg-surface-raised'
        )}
        style={{
          backgroundColor: isCompleted ? (muscleGroupColor || '#4F7FFA') : undefined,
        }}
      >
        <Check size={18} strokeWidth={2} />
      </button>

      {/* Delete button — hidden by default, visible on hover */}
      <button
        onClick={() => deleteSet.mutate(set.id)}
        className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 text-text-muted opacity-0 hover:opacity-100 active:bg-surface-raised active:text-red-400 transition-all duration-100"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
