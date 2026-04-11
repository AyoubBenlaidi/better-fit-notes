import type { WorkoutSet } from '@/types/entities';

/**
 * Calculate the volume of a single set based on exercise type.
 * Only counts completed sets (with completedAt).
 * Warmup sets are included in the calculation.
 * 
 * Volume = weight × reps for weight_reps
 * Volume = reps for bodyweight_reps
 * Volume = distance for distance
 * Volume = duration (in minutes) for duration
 */
export function calculateSetVolume(set: WorkoutSet, exerciseType: string): number {
  // Only count completed sets
  if (!set.completedAt) return 0;

  switch (exerciseType) {
    case 'weight_reps':
      return (set.weight ?? 0) * (set.reps ?? 0);
    case 'bodyweight_reps':
      return set.reps ?? 0;
    case 'distance':
      return set.distance ?? 0;
    case 'duration':
      return (set.duration ?? 0) / 60; // convert seconds to minutes
    default:
      return 0;
  }
}

/**
 * Calculate the total volume for a list of sets.
 */
export function calculateTotalVolume(sets: WorkoutSet[], exerciseType: string): number {
  return sets.reduce((total, set) => total + calculateSetVolume(set, exerciseType), 0);
}

/**
 * Format volume for display based on exercise type.
 * Always displays weight_reps in Kg (never converts to tonnes).
 */
export function formatVolume(volume: number, exerciseType: string): string {
  if (volume === 0) return '—';

  switch (exerciseType) {
    case 'weight_reps':
      // Always display in Kg, even if very large
      return `${volume.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`;
    case 'bodyweight_reps':
      return `${volume.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} reps`;
    case 'distance':
      return `${volume.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} m`;
    case 'duration':
      return `${volume.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} min`;
    default:
      return '—';
  }
}
