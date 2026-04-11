import Dexie, { type Table } from 'dexie';
import type {
  Exercise,
  ExerciseType,
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

    const stores = {
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
    };

    // v1: original schema with legacy string IDs (mg-xxx, ex-xxx)
    this.version(1).stores(stores);

    // v2: migrate all legacy string IDs to proper UUIDs so Supabase accepts them
    this.version(2).stores(stores).upgrade(async (tx) => {
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

// ─── Exercise Library (source: FitNotes CSV referential) ──────────────────────

interface ExerciseDef {
  name: string;
  mgKey: string;
  type: ExerciseType;
}

export const MUSCLE_GROUP_NAMES: Record<string, string> = {
  'mg-chest':      'Poitrine',
  'mg-back':       'Dos',
  'mg-shoulders':  'Épaules',
  'mg-biceps':     'Biceps',
  'mg-triceps':    'Triceps',
  'mg-forearms':   'Avant-bras',
  'mg-quads':      'Quadriceps',
  'mg-hamstrings': 'Ischio-jambiers',
  'mg-glutes':     'Fessiers',
  'mg-calves':     'Mollets',
  'mg-abs':        'Abdominaux',
  'mg-cardio':     'Cardio',
};

export const EXERCISE_LIBRARY: ExerciseDef[] = [
  // ── Abs ───────────────────────────────────────────────────────────────────
  { name: 'Crunch',              mgKey: 'mg-abs', type: 'bodyweight_reps' },
  { name: 'Crunch Machine',      mgKey: 'mg-abs', type: 'weight_reps'     },
  { name: 'Hanging Knee Raise',  mgKey: 'mg-abs', type: 'bodyweight_reps' },
  { name: 'Plank',               mgKey: 'mg-abs', type: 'duration'        },

  // ── Avant-bras ────────────────────────────────────────────────────────────
  { name: 'Avant Bras Barre', mgKey: 'mg-forearms', type: 'weight_reps' },
  { name: 'Hanging',          mgKey: 'mg-forearms', type: 'duration'     },

  // ── Dos ───────────────────────────────────────────────────────────────────
  { name: 'Barbell Row',          mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'Chin Up',              mgKey: 'mg-back', type: 'bodyweight_reps' },
  { name: 'Deadlift',             mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'Dumbbell Row',         mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'Extension Enroulée',   mgKey: 'mg-back', type: 'bodyweight_reps' },
  { name: 'Facepull',             mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'Hammer Strength Row',  mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'Lat Pulldown',         mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'One Arm Cable Pull',   mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'One Arm Machine',      mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'One Hand Machine Pull',mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'Poulie Assis',         mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'Pull Down',            mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'Pull Up',              mgKey: 'mg-back', type: 'bodyweight_reps' },
  { name: 'Row Machine',          mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'Seated Cable Row',     mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'T-Bar Row',            mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'Tirage Machine',       mgKey: 'mg-back', type: 'weight_reps'     },
  { name: 'Two Hands Machine Pull',mgKey: 'mg-back', type: 'weight_reps'    },

  // ── Biceps ────────────────────────────────────────────────────────────────
  { name: 'Arm Curl',                    mgKey: 'mg-biceps', type: 'weight_reps'     },
  { name: 'Barbell Curl',                mgKey: 'mg-biceps', type: 'weight_reps'     },
  { name: 'Cable Curl',                  mgKey: 'mg-biceps', type: 'weight_reps'     },
  { name: 'Dumbbell Concentration Curl', mgKey: 'mg-biceps', type: 'weight_reps'     },
  { name: 'Dumbbell Curl',               mgKey: 'mg-biceps', type: 'weight_reps'     },
  { name: 'Dumbbell Hammer Curl',        mgKey: 'mg-biceps', type: 'weight_reps'     },
  { name: 'Dumbbell Preacher Curl',      mgKey: 'mg-biceps', type: 'weight_reps'     },
  { name: 'EZ-Bar Curl',                 mgKey: 'mg-biceps', type: 'weight_reps'     },
  { name: 'Inclined Bench Dumbell Curl', mgKey: 'mg-biceps', type: 'weight_reps'     },
  { name: 'Pull Up Biceps',              mgKey: 'mg-biceps', type: 'bodyweight_reps' },
  { name: 'Seated Machine Curl',         mgKey: 'mg-biceps', type: 'weight_reps'     },
  { name: 'Spider Curl',                 mgKey: 'mg-biceps', type: 'weight_reps'     },
  { name: 'Superman',                    mgKey: 'mg-biceps', type: 'bodyweight_reps' },
  { name: 'Superset Barbell Curl',       mgKey: 'mg-biceps', type: 'weight_reps'     },

  // ── Cardio ────────────────────────────────────────────────────────────────
  { name: 'Cycling',             mgKey: 'mg-cardio', type: 'duration' },
  { name: 'Rowing Machine',      mgKey: 'mg-cardio', type: 'duration' },
  { name: 'Running (Treadmill)', mgKey: 'mg-cardio', type: 'distance' },
  { name: 'Stationary Bike',     mgKey: 'mg-cardio', type: 'duration' },
  { name: 'Swimming',            mgKey: 'mg-cardio', type: 'duration' },
  { name: 'Walking',             mgKey: 'mg-cardio', type: 'distance' },

  // ── Poitrine ──────────────────────────────────────────────────────────────
  { name: 'Cable Crossover',             mgKey: 'mg-chest', type: 'weight_reps'     },
  { name: 'Chest Press',                 mgKey: 'mg-chest', type: 'weight_reps'     },
  { name: 'Converging Chest Press',      mgKey: 'mg-chest', type: 'weight_reps'     },
  { name: 'Decline Barbell Bench Press', mgKey: 'mg-chest', type: 'weight_reps'     },
  { name: 'Dips Focus Pec',              mgKey: 'mg-chest', type: 'bodyweight_reps' },
  { name: 'Flat Barbell Bench Press',    mgKey: 'mg-chest', type: 'weight_reps'     },
  { name: 'Flat Dumbbell Bench Press',   mgKey: 'mg-chest', type: 'weight_reps'     },
  { name: 'Flat Dumbbell Fly',           mgKey: 'mg-chest', type: 'weight_reps'     },
  { name: 'Incline Barbell Bench Press', mgKey: 'mg-chest', type: 'weight_reps'     },
  { name: 'Incline Dumbbell Bench Press',mgKey: 'mg-chest', type: 'weight_reps'     },
  { name: 'Incline Dumbbell Fly',        mgKey: 'mg-chest', type: 'weight_reps'     },
  { name: 'One Arm Chest Press',         mgKey: 'mg-chest', type: 'weight_reps'     },
  { name: 'Pull Over',                   mgKey: 'mg-chest', type: 'weight_reps'     },
  { name: 'Seated Machine Fly',          mgKey: 'mg-chest', type: 'weight_reps'     },
  { name: 'Seated Machine Press',        mgKey: 'mg-chest', type: 'weight_reps'     },

  // ── Legs — répartis par groupe musculaire réel ────────────────────────────
  { name: 'Barbell Squat',           mgKey: 'mg-quads',      type: 'weight_reps' },
  { name: 'Fentes',                  mgKey: 'mg-quads',      type: 'weight_reps' },
  { name: 'Hack Squat',              mgKey: 'mg-quads',      type: 'weight_reps' },
  { name: 'Leg Extension Machine',   mgKey: 'mg-quads',      type: 'weight_reps' },
  { name: 'Leg Press',               mgKey: 'mg-quads',      type: 'weight_reps' },
  { name: 'Seated Leg Curl Machine', mgKey: 'mg-hamstrings', type: 'weight_reps' },
  { name: 'Adducteurs',              mgKey: 'mg-glutes',     type: 'weight_reps' },
  { name: 'Fessiers',                mgKey: 'mg-glutes',     type: 'weight_reps' },
  { name: 'Barbell Calf Raise',      mgKey: 'mg-calves',     type: 'weight_reps' },
  { name: 'Calf Press',              mgKey: 'mg-calves',     type: 'weight_reps' },
  { name: 'Seated Calf Raise Machine',mgKey: 'mg-calves',    type: 'weight_reps' },

  // ── Épaules ───────────────────────────────────────────────────────────────
  { name: 'Arnold Dumbbell Press',          mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Cable Face Pull',                mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Cable Pull',                     mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Converging Press',               mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Front Barbell Raise',            mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Front Cable Pull',               mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Front Dumbbell Raise',           mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Full Arnold Dumbbell',           mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Lateral Dumbbell Raise',         mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Lateral Machine Raise',          mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Oiseau Banc Décline',            mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Oiseau Dumbell',                 mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Oiseau Semi Décliné',            mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'One Arm Oiseau Poulie',          mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'One-Arm Standing Dumbbell Press',mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Overhead Press',                 mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Rear Delt Dumbbell Raise',       mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Rear Delt Machine Fly',          mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Seated Dumbbell Press',          mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Shoulder Press',                 mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Trapèzes',                       mgKey: 'mg-shoulders', type: 'weight_reps' },
  { name: 'Y Cable Raise',                  mgKey: 'mg-shoulders', type: 'weight_reps' },

  // ── Triceps ───────────────────────────────────────────────────────────────
  { name: 'Arm Extension',                  mgKey: 'mg-triceps', type: 'weight_reps'     },
  { name: 'Bar Pull Down',                  mgKey: 'mg-triceps', type: 'weight_reps'     },
  { name: 'Cable Overhead Triceps Extension',mgKey: 'mg-triceps', type: 'weight_reps'   },
  { name: 'Cable Pull Down',                mgKey: 'mg-triceps', type: 'weight_reps'     },
  { name: 'Close Grip Barbell Bench Press', mgKey: 'mg-triceps', type: 'weight_reps'     },
  { name: 'EZ-Bar Skullcrusher',            mgKey: 'mg-triceps', type: 'weight_reps'     },
  { name: 'Extension Trichée',              mgKey: 'mg-triceps', type: 'weight_reps'     },
  { name: 'Lying Triceps Extension',        mgKey: 'mg-triceps', type: 'weight_reps'     },
  { name: 'One Arm Pull Down',              mgKey: 'mg-triceps', type: 'weight_reps'     },
  { name: 'Parallel Bar Triceps Dip',       mgKey: 'mg-triceps', type: 'bodyweight_reps' },
  { name: 'Rope Push Down',                 mgKey: 'mg-triceps', type: 'weight_reps'     },
];

// ─── Seed (first install only) ────────────────────────────────────────────────

async function seedDatabase(database: BetterFitDB) {
  const muscleGroups: MuscleGroup[] = [
    { id: 'mg-chest',      name: 'Poitrine',         color: '#EF4444' },
    { id: 'mg-back',       name: 'Dos',              color: '#3B82F6' },
    { id: 'mg-shoulders',  name: 'Épaules',          color: '#F59E0B' },
    { id: 'mg-biceps',     name: 'Biceps',           color: '#8B5CF6' },
    { id: 'mg-triceps',    name: 'Triceps',          color: '#EC4899' },
    { id: 'mg-forearms',   name: 'Avant-bras',       color: '#14B8A6' },
    { id: 'mg-quads',      name: 'Quadriceps',       color: '#22C55E' },
    { id: 'mg-hamstrings', name: 'Ischio-jambiers',  color: '#F97316' },
    { id: 'mg-glutes',     name: 'Fessiers',         color: '#A855F7' },
    { id: 'mg-calves',     name: 'Mollets',          color: '#06B6D4' },
    { id: 'mg-abs',        name: 'Abdominaux',       color: '#84CC16' },
    { id: 'mg-cardio',     name: 'Cardio',           color: '#64748B' },
  ];

  const now = new Date();
  const exercises: Exercise[] = EXERCISE_LIBRARY.map((def) => ({
    id: crypto.randomUUID(),
    name: def.name,
    muscleGroupId: def.mgKey, // v2 migration will convert mg-xxx → UUID
    type: def.type,
    isCustom: false,
    createdAt: now,
    updatedAt: now,
  }));

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
