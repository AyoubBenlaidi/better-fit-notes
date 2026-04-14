import {
  subMonths, startOfWeek, endOfWeek, addDays, format,
  eachDayOfInterval, eachMonthOfInterval, eachYearOfInterval,
  startOfMonth, endOfMonth, endOfYear, startOfYear,
} from 'date-fns';
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
 * Get volume breakdown data for a period.
 * Granularity adapts to the period:
 *   week     → daily   (Mon–Sun)
 *   month / 3months → weekly
 *   year / alltime  → monthly
 */
export function getWeeklyBreakdown(
  sessions: Session[],
  sessionExercises: SessionExercise[],
  sets: WorkoutSet[],
  exercises: Exercise[],
  periodType: PeriodType,
): { week: string; volume: number; date: Date; sessions: number }[] {
  const config = getPeriodConfig(periodType);

  const exercisesByType = new Map(exercises.map((e) => [e.id, e.type]));
  const seMap = new Map(sessionExercises.map((se) => [se.id, se]));
  const sessionsMap = new Map(sessions.map((s) => [s.id, s]));

  // Build intervals with [start, end, label] based on granularity
  type Interval = { start: Date; end: Date; label: string };
  let intervals: Interval[];

  if (periodType === 'week') {
    // Daily bars: Mon → Sun
    intervals = eachDayOfInterval({ start: config.startDate, end: config.endDate }).map((day) => ({
      start: day,
      end: day,
      label: format(day, 'EEE'), // Mon, Tue, …
    }));
  } else if (periodType === 'year') {
    // Monthly bars: Jan → Dec (all 12, even if future months are empty)
    const yearStart = startOfYear(config.startDate);
    const yearEnd = endOfYear(config.startDate);
    intervals = eachMonthOfInterval({ start: yearStart, end: yearEnd }).map((month) => ({
      start: month,
      end: endOfMonth(month),
      label: format(month, 'MMM'),
    }));
  } else if (periodType === 'alltime') {
    // Yearly bars — start from the first session year, not hardcoded 2000
    const firstSession = sessions.reduce<Date | null>((min, s) => {
      const d = new Date(s.date + 'T00:00:00');
      return min === null || d < min ? d : min;
    }, null);
    const rangeStart = firstSession ? startOfYear(firstSession) : startOfYear(config.endDate);
    intervals = eachYearOfInterval({ start: rangeStart, end: config.endDate }).map((year) => ({
      start: year,
      end: endOfYear(year),
      label: format(year, 'yyyy'),
    }));
  } else {
    // Weekly bars (month, 3months): aligned to period start to avoid overhang
    // Overhang example: period starts Apr 1 (Wed) → eachWeekOfInterval returns Mar 30 (Mon)
    // → first bar labeled "Mar 30" but only shows Apr 1-5 data (misleading)
    intervals = [];
    let cur = config.startDate;
    while (cur <= config.endDate) {
      intervals.push({
        start: cur,
        end: addDays(cur, 6),
        label: format(cur, 'MMM d'),
      });
      cur = addDays(cur, 7);
    }
  }

  return intervals.map(({ start, end, label }) => {
    const ws = format(start, 'yyyy-MM-dd');
    const we = format(end, 'yyyy-MM-dd');

    // Determine which sessions have SEs in this period (don't use activeSessionIds)
    const sessionIdsWithSE = new Set<string>();
    for (const se of sessionExercises) {
      const session = sessionsMap.get(se.sessionId);
      if (session && session.date >= ws && session.date <= we) {
        sessionIdsWithSE.add(se.sessionId);
      }
    }

    const slotSessions = sessions.filter(
      (s) => s.date >= ws && s.date <= we && sessionIdsWithSE.has(s.id),
    );
    const slotSessionIds = new Set(slotSessions.map((s) => s.id));
    const slotSEIds = new Set(
      sessionExercises.filter((se) => slotSessionIds.has(se.sessionId)).map((se) => se.id),
    );

    let volume = 0;
    for (const set of sets) {
      if (!slotSEIds.has(set.sessionExerciseId)) continue;
      const se = seMap.get(set.sessionExerciseId);
      if (!se) continue;
      if (exercisesByType.get(se.exerciseId) !== 'weight_reps') continue;
      if (!set.reps || !set.weight) continue;
      volume += set.weight * set.reps;
    }

    return {
      week: label,
      volume: Math.round(volume),
      date: start,
      sessions: slotSessions.length,
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
