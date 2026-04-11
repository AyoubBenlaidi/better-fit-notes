import { useState } from 'react';
import { Dumbbell, Timer, Route, User, MoreHorizontal, Edit, Trash2, History } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '@/components/ui/Badge';
import type { Exercise, MuscleGroup, ExerciseType } from '@/types/entities';

const typeIcons: Record<ExerciseType, typeof Dumbbell> = {
  weight_reps:     Dumbbell,
  bodyweight_reps: User,
  duration:        Timer,
  distance:        Route,
};

const typeLabels: Record<ExerciseType, string> = {
  weight_reps:     'Weight & Reps',
  bodyweight_reps: 'Bodyweight',
  duration:        'Duration',
  distance:        'Distance',
};

interface ExerciseCardProps {
  exercise: Exercise;
  muscleGroup?: MuscleGroup;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewHistory?: () => void;
  onSelect?: () => void;
  selected?: boolean;
}

export function ExerciseCard({
  exercise,
  muscleGroup,
  onEdit,
  onDelete,
  onViewHistory,
  onSelect,
  selected,
}: ExerciseCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const TypeIcon = typeIcons[exercise.type];

  return (
    <div
      className={clsx(
        'relative flex items-center gap-3 px-4 py-3.5',
        'border-b border-border/40 last:border-b-0',
        'transition-colors duration-fast',
        selected ? 'bg-accent/8' : 'active:bg-surface-raised',
        onSelect && 'cursor-pointer',
      )}
      onClick={onSelect}
    >
      {/* Type icon */}
      <div
        className="h-10 w-10 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={
          muscleGroup?.color
            ? { backgroundColor: muscleGroup.color + '18', border: `1px solid ${muscleGroup.color}28` }
            : { backgroundColor: 'var(--color-surface-raised)' }
        }
      >
        <TypeIcon
          size={17}
          strokeWidth={1.75}
          style={muscleGroup?.color ? { color: muscleGroup.color } : undefined}
          className={!muscleGroup?.color ? 'text-text-secondary' : undefined}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary truncate">{exercise.name}</span>
          {exercise.isCustom && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent/15 text-accent font-semibold flex-shrink-0">
              Custom
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {muscleGroup && (
            <Badge color={muscleGroup.color} className="text-[10px]">
              {muscleGroup.name}
            </Badge>
          )}
          <span className="text-[11px] text-text-muted">{typeLabels[exercise.type]}</span>
        </div>
      </div>

      {/* Context menu */}
      {(onEdit || onDelete || onViewHistory) && (
        <div className="relative flex-shrink-0">
          <button
            className="h-9 w-9 flex items-center justify-center rounded-xl text-text-muted active:bg-surface-raised active:text-text-secondary transition-colors duration-fast"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          >
            <MoreHorizontal size={17} strokeWidth={1.75} />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
              />
              <div className="absolute right-0 top-10 z-20 bg-surface-overlay border border-border/60 rounded-2xl shadow-card-lg py-1.5 min-w-[160px] animate-scale-in">
                {onViewHistory && (
                  <button
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-text-primary active:bg-surface-raised transition-colors duration-fast"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onViewHistory(); }}
                  >
                    <History size={14} strokeWidth={1.75} />
                    View History
                  </button>
                )}
                {onEdit && (
                  <button
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-text-primary active:bg-surface-raised transition-colors duration-fast"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                  >
                    <Edit size={14} strokeWidth={1.75} />
                    Edit
                  </button>
                )}
                {onDelete && (
                  <>
                    <div className="mx-3 my-1 h-px bg-border/60" />
                    <button
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-danger active:bg-surface-raised transition-colors duration-fast"
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                      Delete
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
