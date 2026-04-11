import type { Exercise, Session, WorkoutSet, SessionExercise } from '@/types/entities';
import { db } from '@/db/schema';

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

/**
 * Parse CSV content and return rows
 */
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

/**
 * Parse a CSV line properly handling quotes
 */
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

/**
 * Extract unique exercises from CSV rows
 */
export function extractUniqueExercises(rows: CSVRow[]): Map<string, string> {
  const exercises = new Map<string, string>();
  rows.forEach((row) => {
    if (row.exercise && row.category) {
      exercises.set(row.exercise.toLowerCase(), row.category);
    }
  });
  return exercises;
}

/**
 * Map CSV categories to muscle group IDs
 */
export function mapCategoryToMuscleGroup(category: string): string | null {
  const categoryLower = category.toLowerCase();
  
  const mapping: Record<string, string[]> = {
    'mg-chest': ['chest', 'pec'],
    'mg-back': ['back', 'lat', 'row', 'dos', 'tirage'],
    'mg-shoulders': ['shoulder', 'deltoid', 'delt', 'épaule', 'trapèze'],
    'mg-biceps': ['biceps', 'bicep', 'arm curl'],
    'mg-triceps': ['triceps', 'tricep', 'arm extension'],
    'mg-forearms': ['forearm', 'wrist', 'avant', 'bra'],
    'mg-quads': ['quad', 'quads', 'quadriceps', 'leg extension'],
    'mg-hamstrings': ['hamstring', 'hamstrings'],
    'mg-glutes': ['glute', 'glutes', 'butt', 'fessier'],
    'mg-calves': ['calf', 'calves', 'calf raise'],
    'mg-abs': ['abs', 'ab', 'core', 'abdominal', 'crunch'],
    'mg-cardio': ['cardio', 'running', 'cycling', 'treadmill', 'rowing', 'swimming', 'walking', 'stationary bike'],
  };

  for (const [groupId, keywords] of Object.entries(mapping)) {
    if (keywords.some((kw) => categoryLower.includes(kw))) {
      return groupId;
    }
  }

  return null;
}

/**
 * Check if exercise exists in database
 */
export async function exerciseExists(name: string): Promise<boolean> {
  const exercise = await db.exercises
    .where('name')
    .equalsIgnoreCase(name)
    .first();
  return !!exercise;
}

/**
 * Get or create exercise
 */
export async function getOrCreateExercise(
  name: string,
  muscleGroupId: string
): Promise<Exercise> {
  const existing = await db.exercises
    .where('name')
    .equalsIgnoreCase(name)
    .first();

  if (existing) {
    return existing;
  }

  const exercise: Exercise = {
    id: crypto.randomUUID(),
    name,
    muscleGroupId,
    type: 'weight_reps',
    isCustom: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.exercises.add(exercise);
  return exercise;
}

/**
 * Import CSV data into the database
 */
export async function importCSVData(rows: CSVRow[]) {
  const results = {
    sessionsCreated: 0,
    setsCreated: 0,
    exercisesCreated: 0,
    errors: [] as string[],
  };

  // Group rows by date and exercise
  const sessionMap = new Map<string, Map<string, CSVRow[]>>();

  for (const row of rows) {
    if (!row.date || !row.exercise || !row.category) {
      results.errors.push(`Invalid row: missing date, exercise, or category`);
      continue;
    }

    if (!sessionMap.has(row.date)) {
      sessionMap.set(row.date, new Map());
    }

    const sessionExercises = sessionMap.get(row.date)!;
    if (!sessionExercises.has(row.exercise)) {
      sessionExercises.set(row.exercise, []);
    }

    sessionExercises.get(row.exercise)!.push(row);
  }

  // Create sessions and sets
  for (const [date, exercises] of sessionMap) {
    try {
      const session: Session = {
        id: `session-${Math.random().toString(36).substr(2, 9)}`,
        date,
        templateId: undefined,
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.sessions.add(session);
      results.sessionsCreated++;

      let exerciseOrder = 0;

      for (const [exerciseName, rows] of exercises) {
        // Find muscle group
        const categoryName = rows[0].category;
        const muscleGroupId = mapCategoryToMuscleGroup(categoryName);

        if (!muscleGroupId) {
          results.errors.push(
            `Could not map category "${categoryName}" for exercise "${exerciseName}"`
          );
          continue;
        }

        // Get or create exercise
        const exercise = await getOrCreateExercise(exerciseName, muscleGroupId);

        const now = new Date();
        const sessionExercise: SessionExercise = {
          id: `se-${Math.random().toString(36).substr(2, 9)}`,
          sessionId: session.id,
          exerciseId: exercise.id,
          notes: '',
          order: exerciseOrder++,
          createdAt: now,
          updatedAt: now,
        };

        await db.sessionExercises.add(sessionExercise);

        // Add sets
        let setOrder = 0;
        for (const row of rows) {
          if (row.weight && !isNaN(row.weight) && row.weight > 0 && row.reps && row.reps > 0) {
            const set: WorkoutSet = {
              id: `set-${Math.random().toString(36).substr(2, 9)}`,
              sessionExerciseId: sessionExercise.id,
              weight: row.weight,
              reps: row.reps,
              isWarmup: false,
              completedAt: new Date(),
              order: setOrder++,
              createdAt: now,
              updatedAt: now,
            };

            await db.sets.add(set);
            results.setsCreated++;
          }
        }
      }
    } catch (error) {
      results.errors.push(`Error processing date ${date}: ${error}`);
    }
  }

  return results;
}

/**
 * Validate CSV and return summary
 */
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
    if (!muscleGroupId) {
      summary.unmappedCategories.add(category);
    }

    const exists = await exerciseExists(exerciseName);
    if (!exists) {
      summary.missingExercises.push(exerciseName);
    }
  }

  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  if (dates.length > 0) {
    summary.dateRange.start = dates[0];
    summary.dateRange.end = dates[dates.length - 1];
  }

  return summary;
}
