import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useMuscleGroups } from '../hooks/useExercises';
import type { Exercise, ExerciseType } from '@/types/entities';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  muscleGroupId: z.string().min(1, 'Muscle group is required'),
  type: z.enum(['weight_reps', 'bodyweight_reps', 'duration', 'distance']),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const TYPE_OPTIONS: { value: ExerciseType; label: string }[] = [
  { value: 'weight_reps', label: 'Weight + Reps' },
  { value: 'bodyweight_reps', label: 'Bodyweight Reps' },
  { value: 'duration', label: 'Duration' },
  { value: 'distance', label: 'Distance' },
];

interface ExerciseFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'isCustom'>) => void;
  initial?: Partial<Exercise>;
  loading?: boolean;
}

export function ExerciseForm({ isOpen, onClose, onSubmit, initial, loading }: ExerciseFormProps) {
  const muscleGroups = useMuscleGroups();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      muscleGroupId: '',
      type: 'weight_reps',
      notes: '',
    },
  });

  useEffect(() => {
    if (initial) {
      reset({
        name: initial.name ?? '',
        muscleGroupId: initial.muscleGroupId ?? '',
        type: initial.type ?? 'weight_reps',
        notes: initial.notes ?? '',
      });
    } else {
      reset({ name: '', muscleGroupId: '', type: 'weight_reps', notes: '' });
    }
  }, [initial, reset, isOpen]);

  function handleFormSubmit(data: FormValues) {
    onSubmit(data);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initial ? 'Edit Exercise' : 'New Exercise'}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button
            fullWidth
            loading={loading}
            onClick={handleSubmit(handleFormSubmit)}
          >
            {initial ? 'Save' : 'Create'}
          </Button>
        </div>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(handleFormSubmit)}>
        <Input
          label="Exercise Name"
          placeholder="e.g. Bench Press"
          error={errors.name?.message}
          {...register('name')}
        />

        {/* Muscle Group */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">Muscle Group</label>
          <Controller
            name="muscleGroupId"
            control={control}
            render={({ field }) => (
              <select
                {...field}
                className="h-11 w-full rounded-xl bg-surface-raised border border-border/60 px-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 transition-all duration-fast"
              >
                <option value="">Select muscle group</option>
                {muscleGroups?.map((mg) => (
                  <option key={mg.id} value={mg.id}>
                    {mg.name}
                  </option>
                ))}
              </select>
            )}
          />
          {errors.muscleGroupId && (
            <p className="text-xs text-danger">{errors.muscleGroupId.message}</p>
          )}
        </div>

        {/* Exercise Type */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">Type</label>
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => field.onChange(value)}
                    className={`h-10 rounded-xl border text-sm font-semibold transition-all duration-fast ${
                      field.value === value
                        ? 'bg-accent/15 border-accent/50 text-accent'
                        : 'bg-surface-raised border-border/60 text-text-secondary active:bg-surface-overlay'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">Notes (optional)</label>
          <textarea
            rows={3}
            placeholder="Any notes about this exercise…"
            className="w-full rounded-xl bg-surface-raised border border-border/60 px-3 py-2 text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 transition-all duration-fast resize-none"
            {...register('notes')}
          />
        </div>
      </form>
    </Modal>
  );
}
