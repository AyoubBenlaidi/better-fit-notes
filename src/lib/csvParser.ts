import type { Exercise, ExerciseType, Session, WorkoutSet, SessionExercise } from '@/types/entities';
import { db, MUSCLE_GROUP_NAMES } from '@/db/schema';

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

// After v2 migration the mg-xxx IDs are replaced with UUIDs — resolve via name
async function resolveMuscleGroupUUID(legacyKey: string): Promise<string | null> {
  const direct = await db.muscleGroups.get(legacyKey);
  if (direct) return direct.id;
  const name = MUSCLE_GROUP_NAMES[legacyKey];
  if (!name) return null;
  const mg = await db.muscleGroups.where('name').equals(name).first();
  return mg?.id ?? null;
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
  if (u === 'm')     return Math.round(distance); // already meters (e.g. Rowing Machine)
  return Math.round(distance * 1000); // km → meters
}

export async function exerciseExists(name: string): Promise<boolean> {
  const exercise = await db.exercises.where('name').equalsIgnoreCase(name).first();
  return !!exercise;
}

export async function getOrCreateExercise(name: string, legacyKey: string, type: ExerciseType): Promise<Exercise | null> {
  const existing = await db.exercises.where('name').equalsIgnoreCase(name).first();
  if (existing) return existing;

  const muscleGroupId = await resolveMuscleGroupUUID(legacyKey);
  if (!muscleGroupId) return null;

  const exercise: Exercise = {
    id: crypto.randomUUID(),
    name,
    muscleGroupId,
    type,
    isCustom: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.exercises.add(exercise);
  return exercise;
}

export async function importCSVData(rows: CSVRow[]) {
  const results = {
    sessionsCreated: 0,
    setsCreated: 0,
    exercisesCreated: 0,
    errors: [] as string[],
  };

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
      const session: Session = {
        id: crypto.randomUUID(),
        date,
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.sessions.add(session);
      results.sessionsCreated++;

      let exerciseOrder = 0;

      for (const [exerciseName, exerciseRows] of exercises) {
        const categoryName = exerciseRows[0].category;
        const legacyKey = mapCategoryToMuscleGroup(categoryName);

        if (!legacyKey) {
          results.errors.push(`Could not map category "${categoryName}" for exercise "${exerciseName}"`);
          continue;
        }

        const type = inferExerciseType(exerciseRows);
        const exercise = await getOrCreateExercise(exerciseName, legacyKey, type);

        if (!exercise) {
          results.errors.push(`Could not resolve muscle group for "${exerciseName}" (${categoryName})`);
          continue;
        }

        if (exercise.createdAt.getTime() === exercise.updatedAt.getTime()) {
          results.exercisesCreated++;
        }

        const now = new Date();
        const sessionExercise: SessionExercise = {
          id: crypto.randomUUID(),
          sessionId: session.id,
          exerciseId: exercise.id,
          notes: '',
          order: exerciseOrder++,
          createdAt: now,
          updatedAt: now,
        };

        await db.sessionExercises.add(sessionExercise);

        let setOrder = 0;
        for (const row of exerciseRows) {
          const set: Partial<WorkoutSet> & Pick<WorkoutSet, 'id' | 'sessionExerciseId' | 'order' | 'isWarmup' | 'createdAt' | 'updatedAt'> = {
            id: crypto.randomUUID(),
            sessionExerciseId: sessionExercise.id,
            isWarmup: false,
            order: setOrder++,
            completedAt: new Date(),
            createdAt: now,
            updatedAt: now,
          };

          if (type === 'weight_reps' || type === 'bodyweight_reps') {
            if ((!row.reps || row.reps <= 0)) continue;
            set.reps = row.reps;
            if (row.weight && !isNaN(row.weight) && row.weight > 0) set.weight = row.weight;
          } else if (type === 'duration') {
            const secs = row.time ? parseTimeToSeconds(row.time) : 0;
            if (secs <= 0) continue;
            set.duration = secs;
          } else if (type === 'distance') {
            if (!row.distance || isNaN(row.distance) || row.distance <= 0) continue;
            set.distance = toMeters(row.distance, row.distanceUnit ?? 'km');
            if (row.time) {
              const secs = parseTimeToSeconds(row.time);
              if (secs > 0) set.duration = secs;
            }
          }

          await db.sets.add(set as WorkoutSet);
          results.setsCreated++;
        }
      }
    } catch (error) {
      results.errors.push(`Error processing date ${date}: ${error}`);
    }
  }

  return results;
}

export async function validateCSV(rows: CSVRow[]) {
  const summary = {
    totalRows: rows.length,
    uniqueExercises: new Set<string>(),
    missingExercises: [] as string[],
    unmappedCategories: new Set<string>(),
    dateRange: { start: '', end: '' },
  };

  const exercises = extractUniqueExercises(rows);

  for (const [exerciseName, category] of exercises) {
    summary.uniqueExercises.add(exerciseName);

    const muscleGroupId = mapCategoryToMuscleGroup(category);
    if (!muscleGroupId) summary.unmappedCategories.add(category);

    const exists = await exerciseExists(exerciseName);
    if (!exists) summary.missingExercises.push(exerciseName);
  }

  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  if (dates.length > 0) {
    summary.dateRange.start = dates[0];
    summary.dateRange.end = dates[dates.length - 1];
  }

  return summary;
}
