import { supabase } from '@/lib/supabase';
import type {
  MuscleGroup, Exercise, ExerciseType, Session, SessionExercise, WorkoutSet,
  Template, TemplateExercise, PersonalRecord, PersonalRecordType, UserSettings,
} from '@/types/entities';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = v;
  }
  return out;
}

function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out;
}

const DATE_FIELDS = ['createdAt', 'updatedAt', 'completedAt', 'startedAt', 'finishedAt'];

function parseRow<T>(r: Record<string, unknown>): T {
  const obj = toCamelCase(r);
  for (const key of DATE_FIELDS) {
    if (typeof obj[key] === 'string') obj[key] = new Date(obj[key] as string);
  }
  return obj as T;
}

// Merges object fields + userId into snake_case row for Supabase
function dbRow<T extends object>(obj: T, userId: string): Record<string, unknown> {
  return toSnakeCase({ ...(obj as Record<string, unknown>), userId });
}

function sb() {
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

// ─── MuscleGroups ─────────────────────────────────────────────────────────────

export async function getMuscleGroups(userId: string): Promise<MuscleGroup[]> {
  const { data, error } = await sb()
    .from('muscle_groups').select('*').eq('user_id', userId).order('name');
  if (error) throw error;
  return data.map((r) => parseRow<MuscleGroup>(r));
}

export async function updateMuscleGroupColor(id: string, color: string): Promise<void> {
  const { error } = await sb()
    .from('muscle_groups').update({ color, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// ─── Exercises ────────────────────────────────────────────────────────────────

export async function getExercises(userId: string): Promise<Exercise[]> {
  const { data, error } = await sb()
    .from('exercises').select('*').eq('user_id', userId).order('name');
  if (error) throw error;
  return data.map((r) => parseRow<Exercise>(r));
}

export async function createExercise(
  userId: string,
  data: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Exercise> {
  const now = new Date();
  const r = dbRow({ ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now }, userId);
  const { data: inserted, error } = await sb().from('exercises').insert(r).select().single();
  if (error) throw error;
  return parseRow<Exercise>(inserted);
}

export async function updateExercise(id: string, partial: Partial<Exercise>): Promise<Exercise> {
  const r = toSnakeCase({ ...partial, updatedAt: new Date() });
  const { data, error } = await sb().from('exercises').update(r).eq('id', id).select().single();
  if (error) throw error;
  return parseRow<Exercise>(data);
}

export async function deleteExercise(id: string): Promise<void> {
  const { count, error: countErr } = await sb()
    .from('session_exercises').select('*', { count: 'exact', head: true }).eq('exercise_id', id);
  if (countErr) throw countErr;
  if (count && count > 0) throw new Error('This exercise is used in past sessions and cannot be deleted.');
  const { error } = await sb().from('exercises').delete().eq('id', id);
  if (error) throw error;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function getSessions(userId: string): Promise<Session[]> {
  const { data, error } = await sb()
    .from('sessions').select('*').eq('user_id', userId).order('date', { ascending: false });
  if (error) throw error;
  return data.map((r) => parseRow<Session>(r));
}

export async function getSession(id: string): Promise<Session | null> {
  const { data, error } = await sb().from('sessions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? parseRow<Session>(data) : null;
}

export async function createSession(
  userId: string,
  session: { id: string; date: string; templateId?: string; startedAt?: Date },
): Promise<Session> {
  const now = new Date();
  const r = dbRow({ ...session, createdAt: now, updatedAt: now }, userId);
  const { data, error } = await sb().from('sessions').insert(r).select().single();
  if (error) throw error;
  return parseRow<Session>(data);
}

export async function updateSession(id: string, partial: Partial<Session>): Promise<Session> {
  const r = toSnakeCase({ ...partial, updatedAt: new Date() });
  const { data, error } = await sb().from('sessions').update(r).eq('id', id).select().single();
  if (error) throw error;
  return parseRow<Session>(data);
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await sb().from('sessions').delete().eq('id', id);
  if (error) throw error;
}

// ─── SessionExercises ─────────────────────────────────────────────────────────

export async function getSessionExercises(sessionId: string): Promise<SessionExercise[]> {
  const { data, error } = await sb()
    .from('session_exercises').select('*').eq('session_id', sessionId).order('order');
  if (error) throw error;
  return data.map((r) => parseRow<SessionExercise>(r));
}

export async function getAllSessionExercises(userId: string): Promise<SessionExercise[]> {
  const PAGE = 1000;
  const all: SessionExercise[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb()
      .from('session_exercises').select('*').eq('user_id', userId)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data.map((r) => parseRow<SessionExercise>(r)));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export async function createSessionExercise(
  userId: string,
  se: Omit<SessionExercise, 'createdAt' | 'updatedAt'>,
): Promise<SessionExercise> {
  const now = new Date();
  const r = dbRow({ ...se, createdAt: now, updatedAt: now }, userId);
  const { data, error } = await sb().from('session_exercises').insert(r).select().single();
  if (error) throw error;
  return parseRow<SessionExercise>(data);
}

export async function updateSessionExercise(id: string, partial: Partial<SessionExercise>): Promise<void> {
  const r = toSnakeCase({ ...partial, updatedAt: new Date() });
  const { error } = await sb().from('session_exercises').update(r).eq('id', id);
  if (error) throw error;
}

export async function deleteSessionExercise(id: string): Promise<void> {
  await sb().from('sets').delete().eq('session_exercise_id', id);
  const { error } = await sb().from('session_exercises').delete().eq('id', id);
  if (error) throw error;
}

// ─── Sets ─────────────────────────────────────────────────────────────────────

export async function getSetsForSessionExercise(sessionExerciseId: string): Promise<WorkoutSet[]> {
  const { data, error } = await sb()
    .from('sets').select('*').eq('session_exercise_id', sessionExerciseId).order('order');
  if (error) throw error;
  return data.map((r) => parseRow<WorkoutSet>(r));
}

export async function getAllSets(userId: string): Promise<WorkoutSet[]> {
  const PAGE = 1000;
  const all: WorkoutSet[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb()
      .from('sets').select('*').eq('user_id', userId)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data.map((r) => parseRow<WorkoutSet>(r)));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export async function getSetsForSession(sessionExerciseIds: string[]): Promise<WorkoutSet[]> {
  if (!sessionExerciseIds.length) return [];
  const { data, error } = await sb()
    .from('sets').select('*').in('session_exercise_id', sessionExerciseIds);
  if (error) throw error;
  return data.map((r) => parseRow<WorkoutSet>(r));
}

// Batch helper: splits an array and runs parallel Supabase queries to avoid URL length limits
function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

/**
 * Fetch session exercises for sessions within a date range.
 * Falls back to full-user fetch for the "alltime" period (startDate = '2000-01-01').
 */
export async function getSessionExercisesInRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<SessionExercise[]> {
  if (startDate === '2000-01-01') return getAllSessionExercises(userId);

  const { data: sessData, error: sErr } = await sb()
    .from('sessions').select('id')
    .eq('user_id', userId).gte('date', startDate).lte('date', endDate);
  if (sErr) throw sErr;
  if (!sessData?.length) return [];

  const results = await Promise.all(
    chunks(sessData.map((r) => r.id as string), 100).map((chunk) =>
      sb().from('session_exercises').select('*').in('session_id', chunk)
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []).map((r) => parseRow<SessionExercise>(r));
        }),
    ),
  );
  return results.flat();
}

/**
 * Fetch session exercises AND sets for a period — single entry point for analytics.
 * Uses parallel batched queries; falls back to full-user fetch for alltime.
 */
export async function getAnalyticsData(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<{ sessionExercises: SessionExercise[]; sets: WorkoutSet[] }> {
  if (startDate === '2000-01-01') {
    const [sessionExercises, sets] = await Promise.all([
      getAllSessionExercises(userId),
      getAllSets(userId),
    ]);
    return { sessionExercises, sets };
  }

  const { data: sessData, error: sErr } = await sb()
    .from('sessions').select('id')
    .eq('user_id', userId).gte('date', startDate).lte('date', endDate);
  if (sErr) throw sErr;
  if (!sessData?.length) return { sessionExercises: [], sets: [] };

  const sessionExercises = (await Promise.all(
    chunks(sessData.map((r) => r.id as string), 100).map((chunk) =>
      sb().from('session_exercises').select('*').in('session_id', chunk)
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []).map((r) => parseRow<SessionExercise>(r));
        }),
    ),
  )).flat();

  if (!sessionExercises.length) return { sessionExercises: [], sets: [] };

  const sets = (await Promise.all(
    chunks(sessionExercises.map((se) => se.id), 100).map((chunk) =>
      sb().from('sets').select('*').in('session_exercise_id', chunk)
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []).map((r) => parseRow<WorkoutSet>(r));
        }),
    ),
  )).flat();

  return { sessionExercises, sets };
}

export async function createSet(
  userId: string,
  setData: Omit<WorkoutSet, 'createdAt' | 'updatedAt'>,
): Promise<WorkoutSet> {
  const now = new Date();
  const r = dbRow({ ...setData, createdAt: now, updatedAt: now }, userId);
  const { data, error } = await sb().from('sets').insert(r).select().single();
  if (error) throw error;
  return parseRow<WorkoutSet>(data);
}

export async function updateSet(id: string, partial: Partial<WorkoutSet>): Promise<WorkoutSet> {
  const r = toSnakeCase({ ...partial, updatedAt: new Date() });
  const { data, error } = await sb().from('sets').update(r).eq('id', id).select().single();
  if (error) throw error;
  return parseRow<WorkoutSet>(data);
}

export async function deleteSet(id: string): Promise<void> {
  const { error } = await sb().from('sets').delete().eq('id', id);
  if (error) throw error;
}

// Last sets from the most recent previous session for an exercise (for "Prev" column)
export async function getLastSetsForExercise(exerciseId: string, excludeSeId: string): Promise<WorkoutSet[]> {
  const { data: prevSEs } = await sb()
    .from('session_exercises').select('id')
    .eq('exercise_id', exerciseId).neq('id', excludeSeId)
    .order('created_at', { ascending: false }).limit(1);
  if (!prevSEs?.length) return [];
  const { data, error } = await sb()
    .from('sets').select('*').eq('session_exercise_id', prevSEs[0].id).order('order');
  if (error) return [];
  return data.map((r) => parseRow<WorkoutSet>(r));
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function getTemplates(userId: string): Promise<Template[]> {
  const { data, error } = await sb()
    .from('templates').select('*').eq('user_id', userId).order('name');
  if (error) throw error;
  return data.map((r) => parseRow<Template>(r));
}

export async function createTemplate(
  userId: string,
  data: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Template> {
  const now = new Date();
  const r = dbRow({ ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now }, userId);
  const { data: inserted, error } = await sb().from('templates').insert(r).select().single();
  if (error) throw error;
  return parseRow<Template>(inserted);
}

export async function deleteTemplate(id: string): Promise<void> {
  await sb().from('template_exercises').delete().eq('template_id', id);
  const { error } = await sb().from('templates').delete().eq('id', id);
  if (error) throw error;
}

export async function getTemplateExercises(templateId: string): Promise<TemplateExercise[]> {
  const { data, error } = await sb()
    .from('template_exercises').select('*').eq('template_id', templateId).order('order');
  if (error) throw error;
  return data.map((r) => parseRow<TemplateExercise>(r));
}

// ─── PersonalRecords ──────────────────────────────────────────────────────────

export async function getPersonalRecords(userId: string): Promise<PersonalRecord[]> {
  const { data, error } = await sb()
    .from('personal_records').select('*').eq('user_id', userId).order('date', { ascending: false });
  if (error) throw error;
  return data.map((r) => parseRow<PersonalRecord>(r));
}

export async function upsertPersonalRecord(
  userId: string,
  exerciseId: string,
  type: PersonalRecordType,
  value: number,
  sessionId: string,
  date: string,
): Promise<void> {
  const { data: existing } = await sb()
    .from('personal_records').select('id, value')
    .eq('exercise_id', exerciseId).eq('type', type).eq('user_id', userId).maybeSingle();

  if (existing && value <= existing.value) return;

  if (existing) {
    await sb().from('personal_records')
      .update(toSnakeCase({ value, sessionId, date })).eq('id', existing.id);
  } else {
    await sb().from('personal_records')
      .insert(dbRow({ id: crypto.randomUUID(), exerciseId, type, value, sessionId, date, createdAt: new Date() }, userId));
  }
}

export async function computeAndSavePersonalRecords(userId: string, sessionId: string): Promise<void> {
  const { data: session } = await sb().from('sessions').select('date').eq('id', sessionId).maybeSingle();
  if (!session) return;

  const { data: sessionExercises } = await sb()
    .from('session_exercises').select('id, exercise_id').eq('session_id', sessionId);
  if (!sessionExercises?.length) return;

  const { data: allSets } = await sb()
    .from('sets').select('*')
    .in('session_exercise_id', sessionExercises.map((se) => se.id))
    .not('completed_at', 'is', null);

  for (const se of sessionExercises) {
    const sets = (allSets ?? []).filter((s) => s.session_exercise_id === se.id);
    if (!sets.length) continue;

    const weights = sets.map((s) => s.weight ?? 0).filter((w) => w > 0);
    if (weights.length > 0)
      await upsertPersonalRecord(userId, se.exercise_id, 'max_weight', Math.max(...weights), sessionId, session.date);

    const reps = sets.map((s) => s.reps ?? 0).filter((r) => r > 0);
    if (reps.length > 0)
      await upsertPersonalRecord(userId, se.exercise_id, 'max_reps', Math.max(...reps), sessionId, session.date);

    const volume = sets.reduce((acc, s) => acc + (s.weight ?? 0) * (s.reps ?? 0), 0);
    if (volume > 0)
      await upsertPersonalRecord(userId, se.exercise_id, 'max_volume', volume, sessionId, session.date);
  }

  if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(userId: string): Promise<Partial<UserSettings> | null> {
  const { data } = await sb().from('user_settings').select('*').eq('user_id', userId).maybeSingle();
  if (!data) return null;
  return {
    weightUnit: data.weight_unit,
    dateFormat: data.date_format,
    theme: data.theme,
    firstDayOfWeek: data.first_day_of_week,
  };
}

export async function upsertSettings(userId: string, settings: Partial<UserSettings>): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId };
  if (settings.weightUnit  !== undefined) row.weight_unit      = settings.weightUnit;
  if (settings.dateFormat  !== undefined) row.date_format      = settings.dateFormat;
  if (settings.theme       !== undefined) row.theme            = settings.theme;
  if (settings.firstDayOfWeek !== undefined) row.first_day_of_week = settings.firstDayOfWeek;
  const { error } = await sb().from('user_settings').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;
}

// ─── Analytics: exercise progress chart ──────────────────────────────────────

export async function getExerciseChartData(
  exerciseId: string,
): Promise<{ date: string; maxWeight: number; volume: number; e1rm: number }[]> {
  const { data: sessionExercises } = await sb()
    .from('session_exercises').select('id, session_id').eq('exercise_id', exerciseId);
  if (!sessionExercises?.length) return [];

  const sessionIds = [...new Set(sessionExercises.map((se) => se.session_id))];
  const [{ data: allSets }, { data: sessions }] = await Promise.all([
    sb().from('sets').select('*')
      .in('session_exercise_id', sessionExercises.map((se) => se.id))
      .not('completed_at', 'is', null),
    sb().from('sessions').select('id, date').in('id', sessionIds),
  ]);

  const sessionDateMap = new Map((sessions ?? []).map((s) => [s.id, s.date as string]));
  const results: { date: string; maxWeight: number; volume: number; e1rm: number }[] = [];

  for (const [sessionId, ses] of Object.entries(
    sessionExercises.reduce((acc, se) => {
      (acc[se.session_id] ??= []).push(se.id);
      return acc;
    }, {} as Record<string, string[]>)
  )) {
    const date = sessionDateMap.get(sessionId);
    if (!date) continue;
    const sessionSets = (allSets ?? []).filter((s) => ses.includes(s.session_exercise_id));
    if (!sessionSets.length) continue;

    const topSet = sessionSets.reduce(
      (best, s) => ((s.weight ?? 0) > (best.weight ?? 0) ? s : best),
      sessionSets[0],
    );
    const e1rm = topSet?.weight && topSet?.reps
      ? Math.round(topSet.weight / (1.0278 - 0.0278 * topSet.reps))
      : 0;

    results.push({
      date,
      maxWeight: Math.max(...sessionSets.map((s) => s.weight ?? 0)),
      volume: Math.round(sessionSets.reduce((acc, s) => acc + (s.weight ?? 0) * (s.reps ?? 0), 0)),
      e1rm,
    });
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Calendar: copy session ────────────────────────────────────────────────────

export async function copySession(
  userId: string,
  sourceSessionId: string,
  targetDate: string,
): Promise<string> {
  const now = new Date();

  // Find or create target session
  let { data: targetSession } = await sb()
    .from('sessions').select('id').eq('user_id', userId).eq('date', targetDate).maybeSingle();

  if (!targetSession) {
    const { data: created, error } = await sb()
      .from('sessions')
      .insert(dbRow({ id: crypto.randomUUID(), date: targetDate, createdAt: now, updatedAt: now }, userId))
      .select('id').single();
    if (error) throw error;
    targetSession = created;
  }

  const targetSessionId = targetSession.id;

  const { data: sourceExercises } = await sb()
    .from('session_exercises').select('*').eq('session_id', sourceSessionId).order('order');
  const { data: targetExercises } = await sb()
    .from('session_exercises').select('*').eq('session_id', targetSessionId);

  const maxTargetOrder = (targetExercises ?? []).reduce((m, se) => Math.max(m, se.order), 0);
  let orderOffset = maxTargetOrder;

  for (const se of sourceExercises ?? []) {
    const { data: sourceSets } = await sb()
      .from('sets').select('*').eq('session_exercise_id', se.id).order('order');

    const existingTargetSE = (targetExercises ?? []).find((tse) => tse.exercise_id === se.exercise_id);

    if (existingTargetSE) {
      const { data: existingSets } = await sb()
        .from('sets').select('order').eq('session_exercise_id', existingTargetSE.id).order('order');
      let nextOrder = (existingSets ?? []).reduce((m, s) => Math.max(m, s.order), 0);

      for (const set of sourceSets ?? []) {
        nextOrder++;
        await sb().from('sets').insert(dbRow({
          id: crypto.randomUUID(), sessionExerciseId: existingTargetSE.id,
          order: nextOrder, weight: set.weight, reps: set.reps,
          duration: set.duration, distance: set.distance, rpe: set.rpe,
          notes: set.notes, isWarmup: set.is_warmup, createdAt: now, updatedAt: now,
        }, userId));
      }
    } else {
      orderOffset++;
      const { data: newSE, error } = await sb().from('session_exercises').insert(dbRow({
        id: crypto.randomUUID(), sessionId: targetSessionId,
        exerciseId: se.exercise_id, order: orderOffset,
        createdAt: now, updatedAt: now,
      }, userId)).select('id').single();
      if (error) throw error;

      for (const set of sourceSets ?? []) {
        await sb().from('sets').insert(dbRow({
          id: crypto.randomUUID(), sessionExerciseId: newSE.id,
          order: set.order, weight: set.weight, reps: set.reps,
          duration: set.duration, distance: set.distance, rpe: set.rpe,
          notes: set.notes, isWarmup: set.is_warmup, createdAt: now, updatedAt: now,
        }, userId));
      }
    }
  }

  return targetSessionId;
}

// ─── Library seed (first login) ───────────────────────────────────────────────

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

interface ExerciseDef { name: string; mgKey: string; type: ExerciseType }

const EXERCISE_LIBRARY: ExerciseDef[] = [
  { name: 'Crunch',              mgKey: 'mg-abs', type: 'bodyweight_reps' },
  { name: 'Crunch Machine',      mgKey: 'mg-abs', type: 'weight_reps'     },
  { name: 'Hanging Knee Raise',  mgKey: 'mg-abs', type: 'bodyweight_reps' },
  { name: 'Plank',               mgKey: 'mg-abs', type: 'duration'        },
  { name: 'Avant Bras Barre',    mgKey: 'mg-forearms', type: 'weight_reps' },
  { name: 'Hanging',             mgKey: 'mg-forearms', type: 'duration'    },
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
  { name: 'Cycling',             mgKey: 'mg-cardio', type: 'duration' },
  { name: 'Rowing Machine',      mgKey: 'mg-cardio', type: 'duration' },
  { name: 'Running (Treadmill)', mgKey: 'mg-cardio', type: 'distance' },
  { name: 'Stationary Bike',     mgKey: 'mg-cardio', type: 'duration' },
  { name: 'Swimming',            mgKey: 'mg-cardio', type: 'duration' },
  { name: 'Walking',             mgKey: 'mg-cardio', type: 'distance' },
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

export async function seedLibrary(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const mgDefs = [
    { key: 'mg-chest',      name: 'Poitrine',        color: '#EF4444' },
    { key: 'mg-back',       name: 'Dos',             color: '#3B82F6' },
    { key: 'mg-shoulders',  name: 'Épaules',         color: '#F59E0B' },
    { key: 'mg-biceps',     name: 'Biceps',          color: '#8B5CF6' },
    { key: 'mg-triceps',    name: 'Triceps',         color: '#EC4899' },
    { key: 'mg-forearms',   name: 'Avant-bras',      color: '#14B8A6' },
    { key: 'mg-quads',      name: 'Quadriceps',      color: '#22C55E' },
    { key: 'mg-hamstrings', name: 'Ischio-jambiers', color: '#F97316' },
    { key: 'mg-glutes',     name: 'Fessiers',        color: '#A855F7' },
    { key: 'mg-calves',     name: 'Mollets',         color: '#06B6D4' },
    { key: 'mg-abs',        name: 'Abdominaux',      color: '#84CC16' },
    { key: 'mg-cardio',     name: 'Cardio',          color: '#64748B' },
  ];

  const mgIdMap = new Map(mgDefs.map((mg) => [mg.key, crypto.randomUUID()]));

  const { error: mgErr } = await sb().from('muscle_groups').insert(
    mgDefs.map((mg) => ({ id: mgIdMap.get(mg.key)!, name: mg.name, color: mg.color, user_id: userId, created_at: now, updated_at: now }))
  );
  if (mgErr) throw mgErr;

  const exerciseRows = EXERCISE_LIBRARY.map((def) => ({
    id: crypto.randomUUID(),
    name: def.name,
    muscle_group_id: mgIdMap.get(def.mgKey)!,
    type: def.type,
    is_custom: false,
    user_id: userId,
    created_at: now,
    updated_at: now,
  }));

  const CHUNK = 400;
  for (let i = 0; i < exerciseRows.length; i += CHUNK) {
    const { error } = await sb().from('exercises').insert(exerciseRows.slice(i, i + CHUNK));
    if (error) throw error;
  }

  await sb().from('user_settings').upsert({
    user_id: userId, weight_unit: 'kg', date_format: 'DD/MM/YYYY', theme: 'dark', first_day_of_week: 1,
  }, { onConflict: 'user_id' });
}
