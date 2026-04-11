// ─── Core Entity Types ────────────────────────────────────────────────────────

export interface MuscleGroup {
  id: string;
  name: string;
  color: string; // hex
}

export type ExerciseType = 'weight_reps' | 'bodyweight_reps' | 'duration' | 'distance';

export interface Exercise {
  id: string;
  name: string;
  muscleGroupId: string;
  type: ExerciseType;
  isCustom: boolean;
  notes?: string;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD
  templateId?: string;
  notes?: string;
  startedAt?: Date;
  finishedAt?: Date;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionExercise {
  id: string;
  sessionId: string;
  exerciseId: string;
  order: number;
  notes?: string;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkoutSet {
  id: string;
  sessionExerciseId: string;
  order: number;
  weight?: number;    // kg
  reps?: number;
  duration?: number;  // seconds
  distance?: number;  // meters
  rpe?: number;       // 1–10
  notes?: string;
  isWarmup: boolean;
  completedAt?: Date;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateExercise {
  id: string;
  templateId: string;
  exerciseId: string;
  order: number;
  defaultSets: number;
  defaultReps?: number;
  defaultWeight?: number;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PersonalRecordType =
  | 'max_weight'
  | 'max_reps'
  | 'max_volume'
  | 'max_distance'
  | 'max_duration';

export interface PersonalRecord {
  id: string;
  exerciseId: string;
  type: PersonalRecordType;
  value: number;
  sessionId: string;
  date: string; // YYYY-MM-DD
  userId?: string;
  createdAt: Date;
}

export interface UserSettings {
  id: string;
  weightUnit: 'kg' | 'lbs';
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY';
  theme: 'dark' | 'light' | 'system';
  firstDayOfWeek: 0 | 1;
  userId?: string;
}

export type SyncOperation = 'create' | 'update' | 'delete';

export interface SyncQueueItem {
  id: string;
  table: string;
  operation: SyncOperation;
  recordId: string;
  payload: string; // JSON
  createdAt: Date;
  retries: number;
}
