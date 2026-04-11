import { subMonths, startOfWeek, endOfWeek, format, eachWeekOfInterval, startOfMonth } from 'date-fns';
import type { Session, WorkoutSet, SessionExercise, Exercise } from '@/types/entities';

export type PeriodType = 'week' | 'month' | '3months' | 'year' | 'alltime';

export interface PeriodConfig {
  startDate: Date;
  endDate: Date;
  label: string;
}

/**
 * Get date range for a given period type
 */
export function getPeriodConfig(periodType: PeriodType): PeriodConfig {
  const now = new Date();

  switch (periodType) {
    case 'week':
      return {
        startDate: startOfWeek(now, { weekStartsOn: 1 }),
        endDate: endOfWeek(now, { weekStartsOn: 1 }),
        label: 'This Week',
      };
    case 'month':
      return {
        startDate: startOfMonth(now),
        endDate: now,
        label: 'This Month',
      };
    case '3months':
      return {
        startDate: startOfMonth(subMonths(now, 2)),
        endDate: now,
        label: 'Last 3 Months',
      };
    case 'year':
      return {
        startDate: new Date(now.getFullYear(), 0, 1),
        endDate: now,
        label: 'This Year',
      };
    case 'alltime':
      return {
        startDate: new Date(2000, 0, 1),
        endDate: now,
        label: 'All Time',
      };
  }
}

/**
 * Calculate total volume for a period, only counting completed sets with weight_reps
 */
export function calculatePeriodVolume(
  sessions: Session[],
  sessionExercises: SessionExercise[],
  sets: WorkoutSet[],
  exercises: Exercise[],
  periodType: PeriodType
): number {
  const config = getPeriodConfig(periodType);
  const startStr = format(config.startDate, 'yyyy-MM-dd');
  const endStr = format(config.endDate, 'yyyy-MM-dd');

  // Filter sessions in range
  const inPeriod = sessions.filter((s) => s.date >= startStr && s.date <= endStr);
  const sessionIds = new Set(inPeriod.map((s) => s.id));

  // Filter session exercises in range
  const exercisesByType = new Map<string, string>(exercises.map((e) => [e.id, e.type]));
  const sesIds = sessionExercises
    .filter((se) => sessionIds.has(se.sessionId))
    .map((se) => se.id);
  const sessionExerciseIds = new Set(sesIds);

  // Calculate volume for completed weight_reps sets only
  let total = 0;
  for (const set of sets) {
    if (!sessionExerciseIds.has(set.sessionExerciseId)) continue;
    if (!set.completedAt) continue; // Only completed sets

    // Find associated exercise to check type
    const se = sessionExercises.find((se) => se.id === set.sessionExerciseId);
    if (!se) continue;
    const exerciseType = exercisesByType.get(se.exerciseId);
    if (exerciseType !== 'weight_reps') continue;

    total += (set.weight ?? 0) * (set.reps ?? 0);
  }

  return total;
}

/**
 * Get weekly breakdown data for a period
 */
export function getWeeklyBreakdown(
  sessions: Session[],
  sessionExercises: SessionExercise[],
  sets: WorkoutSet[],
  exercises: Exercise[],
  periodType: PeriodType
): { week: string; volume: number; date: Date; sessions: number }[] {
  const config = getPeriodConfig(periodType);

  // Generate week intervals
  const weeks = eachWeekOfInterval({
    start: config.startDate,
    end: config.endDate,
  }, { weekStartsOn: 1 });

  const exercisesByType = new Map<string, string>(exercises.map((e) => [e.id, e.type]));

  return weeks.map((weekStart) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const ws = format(weekStart, 'yyyy-MM-dd');
    const we = format(weekEnd, 'yyyy-MM-dd');

    // Filter sessions in this week
    const weekSessions = sessions.filter((s) => s.date >= ws && s.date <= we);
    const weekSessionIds = new Set(weekSessions.map((s) => s.id));

    // Filter session exercises in this week
    const sesIds = sessionExercises
      .filter((se) => weekSessionIds.has(se.sessionId))
      .map((se) => se.id);
    const weekSEIds = new Set(sesIds);

    // Calculate volume
    let volume = 0;
    for (const set of sets) {
      if (!weekSEIds.has(set.sessionExerciseId)) continue;
      if (!set.completedAt) continue;

      const se = sessionExercises.find((se) => se.id === set.sessionExerciseId);
      if (!se) continue;
      const exerciseType = exercisesByType.get(se.exerciseId);
      if (exerciseType !== 'weight_reps') continue;

      volume += (set.weight ?? 0) * (set.reps ?? 0);
    }

    return {
      week: format(weekStart, 'MMM d'),
      volume: Math.round(volume),
      date: weekStart,
      sessions: weekSessions.length,
    };
  });
}

/**
 * Get muscle group distribution for a period
 */
export function getMuscleDistribution(
  sessions: Session[],
  sessionExercises: SessionExercise[],
  exercises: Exercise[],
  muscleGroups: Map<string, any>,
  periodType: PeriodType
): { mgId: string; mg: any; count: number }[] {
  const config = getPeriodConfig(periodType);
  const startStr = format(config.startDate, 'yyyy-MM-dd');
  const endStr = format(config.endDate, 'yyyy-MM-dd');

  // Filter sessions in range
  const inPeriod = sessions.filter((s) => s.date >= startStr && s.date <= endStr);
  const sessionIds = new Set(inPeriod.map((s) => s.id));

  // Count by muscle group
  const counts = new Map<string, number>();

  for (const se of sessionExercises) {
    if (!sessionIds.has(se.sessionId)) continue;
    const ex = exercises.find((e) => e.id === se.exerciseId);
    if (!ex) continue;
    
    const mgId = ex.muscleGroupId ?? '';
    counts.set(mgId, (counts.get(mgId) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([mgId, count]) => ({
      mgId,
      mg: muscleGroups.get(mgId),
      count,
    }))
    .filter((d) => d.mg)
    .sort((a, b) => b.count - a.count);
}
