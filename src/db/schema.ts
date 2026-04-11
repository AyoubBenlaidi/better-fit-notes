import Dexie, { type Table } from 'dexie';
import type {
  Exercise,
  Session,
  SessionExercise,
  WorkoutSet,
  Template,
  TemplateExercise,
  MuscleGroup,
  PersonalRecord,
  UserSettings,
  SyncQueueItem,
} from '@/types/entities';

export class BetterFitDB extends Dexie {
  exercises!: Table<Exercise>;
  sessions!: Table<Session>;
  sessionExercises!: Table<SessionExercise>;
  sets!: Table<WorkoutSet>;
  templates!: Table<Template>;
  templateExercises!: Table<TemplateExercise>;
  muscleGroups!: Table<MuscleGroup>;
  personalRecords!: Table<PersonalRecord>;
  userSettings!: Table<UserSettings>;
  syncQueue!: Table<SyncQueueItem>;

  constructor() {
    super('BetterFitDB');

    // v1: original schema with legacy string IDs (mg-xxx, ex-xxx)
    this.version(1).stores({
      exercises: 'id, muscleGroupId, name, isCustom',
      sessions: 'id, date, templateId',
      sessionExercises: 'id, sessionId, exerciseId, order',
      sets: 'id, sessionExerciseId, order',
      templates: 'id, name',
      templateExercises: 'id, templateId, exerciseId',
      muscleGroups: 'id, name',
      personalRecords: 'id, exerciseId, type, date, [exerciseId+type]',
      userSettings: 'id',
      syncQueue: 'id, table, operation, createdAt',
    });

    // v2: migrate all legacy string IDs to proper UUIDs so Supabase accepts them
    this.version(2).stores({
      exercises: 'id, muscleGroupId, name, isCustom',
      sessions: 'id, date, templateId',
      sessionExercises: 'id, sessionId, exerciseId, order',
      sets: 'id, sessionExerciseId, order',
      templates: 'id, name',
      templateExercises: 'id, templateId, exerciseId',
      muscleGroups: 'id, name',
      personalRecords: 'id, exerciseId, type, date, [exerciseId+type]',
      userSettings: 'id',
      syncQueue: 'id, table, operation, createdAt',
    }).upgrade(async (tx) => {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isUUID = (s: string) => UUID_RE.test(s);

      // ── 1. Migrate muscle group IDs ──────────────────────────────────────
      const muscleGroups = await tx.table('muscleGroups').toArray();
      const mgIdMap = new Map<string, string>();
      for (const mg of muscleGroups) {
        if (!isUUID(mg.id)) mgIdMap.set(mg.id, crypto.randomUUID());
      }
      for (const mg of muscleGroups) {
        const newId = mgIdMap.get(mg.id);
        if (newId) {
          await tx.table('muscleGroups').delete(mg.id);
          await tx.table('muscleGroups').add({ ...mg, id: newId });
        }
      }

      // ── 2. Migrate exercise IDs + update muscleGroupId references ────────
      const exercises = await tx.table('exercises').toArray();
      const exIdMap = new Map<string, string>();
      for (const ex of exercises) {
        if (!isUUID(ex.id)) exIdMap.set(ex.id, crypto.randomUUID());
      }
      for (const ex of exercises) {
        const newId = exIdMap.get(ex.id) ?? ex.id;
        const newMgId = (ex.muscleGroupId && mgIdMap.get(ex.muscleGroupId)) ?? ex.muscleGroupId;
        if (exIdMap.has(ex.id)) {
          await tx.table('exercises').delete(ex.id);
          await tx.table('exercises').add({ ...ex, id: newId, muscleGroupId: newMgId });
        } else if (newMgId !== ex.muscleGroupId) {
          await tx.table('exercises').update(ex.id, { muscleGroupId: newMgId });
        }
      }

      // ── 3. Update FK references in child tables ──────────────────────────
      if (exIdMap.size > 0) {
        for (const se of await tx.table('sessionExercises').toArray()) {
          const newExId = exIdMap.get(se.exerciseId);
          if (newExId) await tx.table('sessionExercises').update(se.id, { exerciseId: newExId });
        }
        for (const te of await tx.table('templateExercises').toArray()) {
          const newExId = exIdMap.get(te.exerciseId);
          if (newExId) await tx.table('templateExercises').update(te.id, { exerciseId: newExId });
        }
        for (const pr of await tx.table('personalRecords').toArray()) {
          const newExId = exIdMap.get(pr.exerciseId);
          if (newExId) await tx.table('personalRecords').update(pr.id, { exerciseId: newExId });
        }
      }

      // ── 4. Clear the sync queue — all old IDs are now invalid ───────────
      await tx.table('syncQueue').clear();

      console.log('[DB] ✅ Migration v2 complete', {
        muscleGroupsMigrated: mgIdMap.size,
        exercisesMigrated: exIdMap.size,
      });
    });

    this.on('populate', () => seedDatabase(this));
  }
}

export const db = new BetterFitDB();

// ─── Seed Data ────────────────────────────────────────────────────────────────

async function seedDatabase(database: BetterFitDB) {
  const muscleGroups: MuscleGroup[] = [
    { id: 'mg-chest', name: 'Poitrine', color: '#EF4444' },
    { id: 'mg-back', name: 'Dos', color: '#3B82F6' },
    { id: 'mg-shoulders', name: 'Épaules', color: '#F59E0B' },
    { id: 'mg-biceps', name: 'Biceps', color: '#8B5CF6' },
    { id: 'mg-triceps', name: 'Triceps', color: '#EC4899' },
    { id: 'mg-forearms', name: 'Avant-bras', color: '#14B8A6' },
    { id: 'mg-quads', name: 'Quadriceps', color: '#22C55E' },
    { id: 'mg-hamstrings', name: 'Ischio-jambiers', color: '#F97316' },
    { id: 'mg-glutes', name: 'Fessiers', color: '#A855F7' },
    { id: 'mg-calves', name: 'Mollets', color: '#06B6D4' },
    { id: 'mg-abs', name: 'Abdominaux', color: '#84CC16' },
    { id: 'mg-cardio', name: 'Cardio', color: '#64748B' },
  ];

  const now = new Date();

  // Helper to create exercise with UUID instead of ex-xxx strings
  const createExercise = (name: string, muscleGroupId: string, type: string = 'weight_reps'): Exercise => ({
    id: crypto.randomUUID(),
    name,
    muscleGroupId,
    type: type as any,
    isCustom: false,
    createdAt: now,
    updatedAt: now,
  });

  const exercises: Exercise[] = [
    // Chest
    createExercise('Bench Press', 'mg-chest'),
    createExercise('Incline DB Press', 'mg-chest'),
    createExercise('Cable Fly', 'mg-chest'),
    createExercise('Dips', 'mg-chest', 'bodyweight_reps'),
    createExercise('Decline Bench Press', 'mg-chest'),

    // Back
    createExercise('Pull-Up', 'mg-back', 'bodyweight_reps'),
    createExercise('Barbell Row', 'mg-back'),
    createExercise('Lat Pulldown', 'mg-back'),
    createExercise('Seated Row', 'mg-back'),
    createExercise('Face Pull', 'mg-back'),
    createExercise('Deadlift', 'mg-back'),
    createExercise('Sumo Deadlift', 'mg-back'),
    createExercise('Trap Bar Deadlift', 'mg-back'),

    // Shoulders
    createExercise('Overhead Press (OHP)', 'mg-shoulders'),
    createExercise('Lateral Raise', 'mg-shoulders'),
    createExercise('Front Raise', 'mg-shoulders'),
    createExercise('Rear Delt Fly', 'mg-shoulders'),

    // Biceps
    createExercise('Barbell Curl', 'mg-biceps'),
    createExercise('Incline DB Curl', 'mg-biceps'),
    createExercise('Hammer Curl', 'mg-biceps'),
    createExercise('Preacher Curl', 'mg-biceps'),

    // Triceps
    createExercise('Tricep Pushdown', 'mg-triceps'),
    createExercise('Skull Crushers', 'mg-triceps'),
    createExercise('Close Grip Bench', 'mg-triceps'),
    createExercise('Overhead Tricep Extension', 'mg-triceps'),

    // Forearms
    createExercise('Wrist Curl', 'mg-forearms'),
    createExercise('Farmer Walk', 'mg-forearms', 'distance'),

    // Quads
    createExercise('Squat', 'mg-quads'),
    createExercise('Front Squat', 'mg-quads'),
    createExercise('Leg Press', 'mg-quads'),
    createExercise('Hack Squat', 'mg-quads'),
    createExercise('Leg Extension', 'mg-quads'),

    // Hamstrings
    createExercise('Romanian Deadlift', 'mg-hamstrings'),
    createExercise('Leg Curl', 'mg-hamstrings'),
    createExercise('Good Morning', 'mg-hamstrings'),
    createExercise('Back Extension', 'mg-hamstrings', 'bodyweight_reps'),

    // Glutes
    createExercise('Hip Thrust', 'mg-glutes'),
    createExercise('Glute Kickback', 'mg-glutes'),

    // Calves
    createExercise('Calf Raise', 'mg-calves'),
    createExercise('Seated Calf Raise', 'mg-calves'),

    // Abs
    createExercise('Plank', 'mg-abs', 'duration'),
    createExercise('Hanging Leg Raise', 'mg-abs', 'bodyweight_reps'),
    createExercise('Cable Crunch', 'mg-abs'),
    createExercise('Ab Wheel', 'mg-abs', 'bodyweight_reps'),
    createExercise('Russian Twist', 'mg-abs', 'bodyweight_reps'),

    // Cardio
    createExercise('Running', 'mg-cardio', 'distance'),
    createExercise('Cycling', 'mg-cardio', 'distance'),
    createExercise('Rowing Machine', 'mg-cardio', 'distance'),
    createExercise('Elliptical', 'mg-cardio', 'duration'),
    createExercise('Jump Rope', 'mg-cardio', 'duration'),

    // Back (additional)
    createExercise('Shrug', 'mg-back'),
  ];

  const defaultSettings: UserSettings = {
    id: 'user-settings',
    weightUnit: 'kg',
    dateFormat: 'DD/MM/YYYY',
    theme: 'dark',
    firstDayOfWeek: 1,
  };

  await database.muscleGroups.bulkAdd(muscleGroups);
  await database.exercises.bulkAdd(exercises);
  await database.userSettings.add(defaultSettings);
}
