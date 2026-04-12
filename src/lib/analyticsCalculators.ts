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

  const sessionIds = new Set(
    sessions.filter((s) => s.date >= startStr && s.date <= endStr).map((s) => s.id),
  );

  const exercisesByType = new Map(exercises.map((e) => [e.id, e.type]));
  const seMap = new Map(sessionExercises.map((se) => [se.id, se]));
  const sessionExerciseIds = new Set(
    sessionExercises.filter((se) => sessionIds.has(se.sessionId)).map((se) => se.id),
  );

  let total = 0;
  for (const set of sets) {
    if (!sessionExerciseIds.has(set.sessionExerciseId)) continue;
    const se = seMap.get(set.sessionExerciseId);
    if (!se) continue;
    if (exercisesByType.get(se.exerciseId) !== 'weight_reps') continue;
    if (!set.reps || !set.weight) continue;
    total += set.weight * set.reps;
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
  periodType: PeriodType,
  activeSessionIds?: Set<string>,
): { week: string; volume: number; date: Date; sessions: number }[] {
  const config = getPeriodConfig(periodType);

  // Generate week intervals
  const weeks = eachWeekOfInterval({
    start: config.startDate,
    end: config.endDate,
  }, { weekStartsOn: 1 });

  const exercisesByType = new Map(exercises.map((e) => [e.id, e.type]));
  // Build once outside the per-week loop
  const seMap = new Map(sessionExercises.map((se) => [se.id, se]));

  return weeks.map((weekStart) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const ws = format(weekStart, 'yyyy-MM-dd');
    const we = format(weekEnd, 'yyyy-MM-dd');

    const weekSessions = sessions.filter(
      (s) => s.date >= ws && s.date <= we && (!activeSessionIds || activeSessionIds.has(s.id)),
    );
    const weekSessionIds = new Set(weekSessions.map((s) => s.id));
    const weekSEIds = new Set(
      sessionExercises.filter((se) => weekSessionIds.has(se.sessionId)).map((se) => se.id),
    );

    let volume = 0;
    for (const set of sets) {
      if (!weekSEIds.has(set.sessionExerciseId)) continue;
      const se = seMap.get(set.sessionExerciseId);
      if (!se) continue;
      if (exercisesByType.get(se.exerciseId) !== 'weight_reps') continue;
      if (!set.reps || !set.weight) continue;
      volume += set.weight * set.reps;
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

  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
  const counts = new Map<string, number>();

  for (const se of sessionExercises) {
    if (!sessionIds.has(se.sessionId)) continue;
    const ex = exerciseMap.get(se.exerciseId);
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
