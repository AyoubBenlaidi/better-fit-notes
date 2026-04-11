import { useState, useMemo, useCallback } from 'react';
import { Plus, Search, X, Palette } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { ExerciseCard } from '@/domains/exercises/components/ExerciseCard';
import { ExerciseForm } from '@/domains/exercises/components/ExerciseForm';
import { MuscleGroupColors } from '@/domains/exercises/components/MuscleGroupColors';
import {
  useExercises,
  useMuscleGroups,
  useCreateExercise,
  useUpdateExercise,
  useDeleteExercise,
  useUpdateMuscleGroup,
} from '@/domains/exercises/hooks/useExercises';
import type { Exercise } from '@/types/entities';
import { useDebounce } from '@/lib/useDebounce';
import { Dumbbell } from 'lucide-react';
import { clsx } from 'clsx';

export function ExercisesPage() {
  const [search, setSearch] = useState('');
  const [selectedMgId, setSelectedMgId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Exercise | null>(null);
  const [colorsModalOpen, setColorsModalOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300);
  const muscleGroups = useMuscleGroups();
  const exercises = useExercises({
    muscleGroupId: selectedMgId ?? undefined,
    search: debouncedSearch || undefined,
  });

  const createExercise = useCreateExercise();
  const updateExercise = useUpdateExercise();
  const deleteExercise = useDeleteExercise();
  const updateMuscleGroup = useUpdateMuscleGroup();

  const mgMap = useMemo(
    () => new Map(muscleGroups?.map((mg) => [mg.id, mg]) ?? []),
    [muscleGroups],
  );

  const handleCreate = useCallback(
    async (data: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'isCustom'>) => {
      await createExercise.mutateAsync(data);
      setFormOpen(false);
    },
    [createExercise],
  );

  const handleColorChange = useCallback(
    async (mgId: string, color: string) => {
      await updateMuscleGroup.mutateAsync({ id: mgId, color });
    },
    [updateMuscleGroup],
  );

  const handleUpdate = useCallback(
    async (data: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'isCustom'>) => {
      if (!editTarget) return;
      await updateExercise.mutateAsync({ id: editTarget.id, ...data });
      setEditTarget(null);
    },
    [editTarget, updateExercise],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Delete this exercise?')) return;
      await deleteExercise.mutateAsync(id);
    },
    [deleteExercise],
  );

  const isLoading = exercises === undefined || muscleGroups === undefined;

  return (
    <div className="flex flex-col min-h-full bg-surface-base">
      <Header
        title="Exercises"
        right={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setColorsModalOpen(true)}>
              <Palette size={16} />
            </Button>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus size={16} />
              Add
            </Button>
          </div>
        }
      />

      {/* Search bar */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="search"
            placeholder="Search exercises…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={clsx(
              'w-full h-11 bg-surface-card border border-border/60 rounded-2xl',
              'pl-10 pr-10 text-sm text-text-primary placeholder:text-text-muted',
              'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60',
              'transition-all duration-fast',
            )}
          />
          {search && (
            <button
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              onClick={() => setSearch('')}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Muscle group chips */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide flex-shrink-0">
        <button
          onClick={() => setSelectedMgId(null)}
          className={clsx(
            'flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-fast',
            selectedMgId === null
              ? 'bg-accent text-white border-accent shadow-accent-glow'
              : 'bg-surface-card text-text-secondary border-border/60 active:bg-surface-raised',
          )}
        >
          All
        </button>
        {muscleGroups?.map((mg) => (
          <button
            key={mg.id}
            onClick={() => setSelectedMgId(selectedMgId === mg.id ? null : mg.id)}
            className="flex-shrink-0 transition-all duration-fast active:scale-95"
          >
            <Badge
              color={mg.color}
              variant={selectedMgId === mg.id ? 'filled' : 'outline'}
              className="cursor-pointer py-1.5 px-3.5 text-xs font-semibold"
            >
              {mg.name}
            </Badge>
          </button>
        ))}
      </div>

      {/* Exercise count */}
      {!isLoading && exercises!.length > 0 && (
        <div className="px-4 pb-2">
          <span className="text-xs text-text-muted font-mono">
            {exercises!.length} exercise{exercises!.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Exercise list */}
      <div className="flex-1">
        {isLoading ? (
          <SkeletonList count={6} />
        ) : exercises!.length === 0 ? (
          <EmptyState
            icon={<Dumbbell size={48} />}
            title="No exercises found"
            description={search ? 'Try a different search term.' : 'Add your first custom exercise.'}
            action={!search ? { label: 'Add Exercise', onClick: () => setFormOpen(true) } : undefined}
          />
        ) : (
          <div className="bg-surface-base">
            {exercises!.map((ex) => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                muscleGroup={mgMap.get(ex.muscleGroupId)}
                onEdit={() => setEditTarget(ex)}
                onDelete={() => handleDelete(ex.id)}
              />
            ))}
          </div>
        )}
      </div>

      <ExerciseForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreate}
        loading={createExercise.isPending}
      />
      <ExerciseForm
        isOpen={editTarget !== null}
        onClose={() => setEditTarget(null)}
        onSubmit={handleUpdate}
        initial={editTarget ?? undefined}
        loading={updateExercise.isPending}
      />
      
      <MuscleGroupColors
        isOpen={colorsModalOpen}
        onClose={() => setColorsModalOpen(false)}
        muscleGroups={muscleGroups ?? []}
        onColorChange={handleColorChange}
        loading={updateMuscleGroup.isPending}
      />
    </div>
  );
}
