import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ExerciseCard } from '@/domains/exercises/components/ExerciseCard';
import { useExercises, useMuscleGroups } from '@/domains/exercises/hooks/useExercises';
import { Badge } from '@/components/ui/Badge';
import { useDebounce } from '@/lib/useDebounce';
import type { Exercise } from '@/types/entities';
import { clsx } from 'clsx';

interface AddExerciseSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
  excludeIds?: string[];
}

export function AddExerciseSheet({ isOpen, onClose, onSelect, excludeIds = [] }: AddExerciseSheetProps) {
  const [search, setSearch] = useState('');
  const [selectedMgId, setSelectedMgId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 200);
  const muscleGroups = useMuscleGroups();
  const exercises = useExercises({
    muscleGroupId: selectedMgId ?? undefined,
    search: debouncedSearch || undefined,
  });

  const filtered = exercises?.filter((e) => !excludeIds.includes(e.id));
  const mgMap = new Map(muscleGroups?.map((mg) => [mg.id, mg]) ?? []);

  function handleSelect(exercise: Exercise) {
    onSelect(exercise);
    onClose();
    setSearch('');
    setSelectedMgId(null);
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Add Exercise" snapToFull>
      <div className="flex flex-col h-full">

        {/* Search */}
        <div className="px-4 py-3 border-b border-border/40">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="search"
              autoFocus
              placeholder="Search exercises…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={clsx(
                'w-full h-11 bg-surface-raised border border-border/60 rounded-2xl',
                'pl-10 pr-10 text-sm text-text-primary placeholder:text-text-muted',
                'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60',
                'transition-all duration-fast',
              )}
            />
            {search && (
              <button
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                onClick={() => setSearch('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Muscle group chips */}
        <div className="flex gap-2 px-4 py-2.5 overflow-x-auto scrollbar-hide border-b border-border/40 flex-shrink-0">
          <button
            onClick={() => setSelectedMgId(null)}
            className={clsx(
              'flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-fast',
              selectedMgId === null
                ? 'bg-accent text-white border-accent'
                : 'bg-surface-raised text-text-secondary border-border/60',
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
                className="cursor-pointer py-1.5 px-3 text-xs"
              >
                {mg.name}
              </Badge>
            </button>
          ))}
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto">
          {filtered?.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center px-4">
              <p className="text-sm text-text-secondary">No exercises found</p>
            </div>
          )}
          {filtered?.map((ex) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              muscleGroup={mgMap.get(ex.muscleGroupId)}
              onSelect={() => handleSelect(ex)}
            />
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
