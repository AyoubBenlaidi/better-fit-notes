import type { ExerciseType } from '@/types/entities';
import { MUSCLE_GROUP_NAMES, getExercises, getMuscleGroups, createExercise, createSession, createSessionExercise, createSet } from '@/lib/api';

export interface CSVRow {
  date: string;
  exercise: string;
  category: string;
  weight?: number;
  weightUnit?: string;
  reps?: number;
  distance?: number;
  distanceUnit?: string;
  time?: string;
}

export function parseCSV(content: string): CSVRow[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;

    rows.push({
      date: values[headers.indexOf('date')] || '',
      exercise: values[headers.indexOf('exercise')] || '',
      category: values[headers.indexOf('category')] || '',
      weight: parseFloat(values[headers.indexOf('weight')] || ''),
      weightUnit: values[headers.indexOf('weight unit')] || 'kgs',
      reps: parseInt(values[headers.indexOf('reps')] || '0'),
      distance: parseFloat(values[headers.indexOf('distance')] || ''),
      distanceUnit: values[headers.indexOf('distance unit')] || 'km',
      time: values[headers.indexOf('time')] || '',
    });
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export function extractUniqueExercises(rows: CSVRow[]): Map<string, string> {
  const exercises = new Map<string, string>();
  rows.forEach((row) => {
    if (row.exercise && row.category) {
      exercises.set(row.exercise.toLowerCase(), row.category);
    }
  });
  return exercises;
}

export function mapCategoryToMuscleGroup(category: string): string | null {
  const categoryLower = category.toLowerCase();

  const mapping: Record<string, string[]> = {
    'mg-chest': ['chest', 'pec'],
    'mg-back': ['back', 'lat', 'row', 'dos', 'tirage', 'lower back'],
    'mg-shoulders': ['shoulder', 'deltoid', 'delt', 'épaule', 'trapèze'],
    'mg-biceps': ['biceps', 'bicep', 'arm curl'],
    'mg-triceps': ['triceps', 'tricep', 'arm extension'],
    'mg-forearms': ['forearm', 'wrist', 'avant bras', 'avant-bras'],
    'mg-quads': ['quad', 'quadriceps', 'leg extension', 'legs', 'full body'],
    'mg-hamstrings': ['hamstring'],
    'mg-glutes': ['glute', 'butt', 'fessier'],
    'mg-calves': ['calf', 'calves'],
    'mg-abs': ['abs', 'abdominal', 'core', 'crunch', 'neck'],
    'mg-cardio': ['cardio', 'cardiovascular', 'running', 'cycling', 'treadmill', 'rowing', 'swimming', 'walking'],
  };

  for (const [groupId, keywords] of Object.entries(mapping)) {
    if (keywords.some((kw) => categoryLower === kw || categoryLower.includes(kw))) {
      return groupId;
    }
  }

  return null;
}

function inferExerciseType(rows: CSVRow[]): ExerciseType {
  const first = rows[0];
  if (first.distance && !isNaN(first.distance) && first.distance > 0) return 'distance';
  if (first.time && first.time !== '00:00:00' && first.time !== '') return 'duration';
  if (first.reps && first.reps > 0 && (!first.weight || isNaN(first.weight) || first.weight === 0)) return 'bodyweight_reps';
  return 'weight_reps';
}

function parseTimeToSeconds(time: string): number {
  const parts = time.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function toMeters(distance: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === 'miles') return Math.round(distance * 1609.34);
  if (u === 'm')     return Math.round(distance);
  return Math.round(distance * 1000); // km → meters
}

export async function validateCSV(rows: CSVRow[], userId: string) {
  const summary = {
    totalRows: rows.length,
    uniqueExercises: new Set<string>(),
    missingExercises: [] as string[],
    unmappedCategories: new Set<string>(),
    dateRange: { start: '', end: '' },
  };

  const exercises = await getExercises(userId);
  const existingNames = new Set(exercises.map((e) => e.name.toLowerCase()));
  const uniqueExercises = extractUniqueExercises(rows);

  for (const [exerciseName, category] of uniqueExercises) {
    summary.uniqueExercises.add(exerciseName);

    const muscleGroupId = mapCategoryToMuscleGroup(category);
    if (!muscleGroupId) summary.unmappedCategories.add(category);

    if (!existingNames.has(exerciseName)) summary.missingExercises.push(exerciseName);
  }

  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  if (dates.length > 0) {
    summary.dateRange.start = dates[0];
    summary.dateRange.end = dates[dates.length - 1];
  }

  return summary;
}

export async function importCSVData(rows: CSVRow[], userId: string) {
  const results = {
    sessionsCreated: 0,
    setsCreated: 0,
    exercisesCreated: 0,
    errors: [] as string[],
  };

  const [existingExercises, muscleGroups] = await Promise.all([
    getExercises(userId),
    getMuscleGroups(userId),
  ]);

  // Mutable cache so newly created exercises are found in subsequent iterations
  const exerciseCache = new Map(existingExercises.map((e) => [e.name.toLowerCase(), e]));
  const mgByLegacyKey = new Map(
    muscleGroups
      .map((mg) => {
        const legacyKey = Object.entries(MUSCLE_GROUP_NAMES).find(([, name]) => name === mg.name)?.[0];
        return legacyKey ? [legacyKey, mg.id] as const : null;
      })
      .filter((entry): entry is [string, string] => entry !== null),
  );

  // Group rows by date → exercise
  const sessionMap = new Map<string, Map<string, CSVRow[]>>();

  for (const row of rows) {
    if (!row.date || !row.exercise || !row.category) {
      results.errors.push(`Invalid row: missing date, exercise, or category`);
      continue;
    }
    if (!sessionMap.has(row.date)) sessionMap.set(row.date, new Map());
    const sessionExercises = sessionMap.get(row.date)!;
    if (!sessionExercises.has(row.exercise)) sessionExercises.set(row.exercise, []);
    sessionExercises.get(row.exercise)!.push(row);
  }

  for (const [date, exercises] of sessionMap) {
    try {
      const session = await createSession(userId, { id: crypto.randomUUID(), date });
      results.sessionsCreated++;

      let exerciseOrder = 0;

      for (const [exerciseName, exerciseRows] of exercises) {
        const categoryName = exerciseRows[0].category;
        const legacyKey = mapCategoryToMuscleGroup(categoryName);

        if (!legacyKey) {
          results.errors.push(`Could not map category "${categoryName}" for exercise "${exerciseName}"`);
          continue;
        }

        let exercise = exerciseCache.get(exerciseName.toLowerCase()) ?? null;

        if (!exercise) {
          const muscleGroupId = mgByLegacyKey.get(legacyKey);
          if (!muscleGroupId) {
            results.errors.push(`Could not resolve muscle group for "${exerciseName}" (${categoryName})`);
            continue;
          }
          const type = inferExerciseType(exerciseRows);
          exercise = await createExercise(userId, { name: exerciseName, muscleGroupId, type, isCustom: false });
          exerciseCache.set(exerciseName.toLowerCase(), exercise);
          results.exercisesCreated++;
        }

        const se = await createSessionExercise(userId, {
          id: crypto.randomUUID(),
          sessionId: session.id,
          exerciseId: exercise.id,
          order: exerciseOrder++,
        });

        const type = inferExerciseType(exerciseRows);
        let setOrder = 0;
        for (const row of exerciseRows) {
          const setData: Parameters<typeof createSet>[1] = {
            id: crypto.randomUUID(),
            sessionExerciseId: se.id,
            isWarmup: false,
            order: setOrder++,
          };

          if (type === 'weight_reps' || type === 'bodyweight_reps') {
            if (!row.reps || row.reps <= 0) continue;
            setData.reps = row.reps;
            if (row.weight && !isNaN(row.weight) && row.weight > 0) setData.weight = row.weight;
          } else if (type === 'duration') {
            const secs = row.time ? parseTimeToSeconds(row.time) : 0;
            if (secs <= 0) continue;
            setData.duration = secs;
          } else if (type === 'distance') {
            if (!row.distance || isNaN(row.distance) || row.distance <= 0) continue;
            setData.distance = toMeters(row.distance, row.distanceUnit ?? 'km');
            if (row.time) {
              const secs = parseTimeToSeconds(row.time);
              if (secs > 0) setData.duration = secs;
            }
          }

          await createSet(userId, setData);
          results.setsCreated++;
        }
      }
    } catch (error) {
      results.errors.push(`Error processing date ${date}: ${error}`);
    }
  }

  return results;
}
