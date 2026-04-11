import { db } from '@/db/schema';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { SyncQueueItem } from '@/types/entities';
import { useAuthStore } from '@/stores/authStore';

// ─── Config ───────────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 30_000;
const MAX_RETRIES = 5;

let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let lastInitializedUserId: string | null = null; // prevent double initialSync

/**
 * Queue-based sync tables ordered by FK dependency (parents first).
 * Deletes use the reverse order.
 */
const QUEUE_TABLE_ORDER = [
  'sessions',
  'templates',
  'sessionExercises',
  'templateExercises',
  'sets',
  'personalRecords',
] as const;
type QueueTable = (typeof QUEUE_TABLE_ORDER)[number];

/** FK parent relationships — used to defer children until parent is synced */
const FK_DEPS: Record<string, { parentTable: QueueTable; field: string }> = {
  sessionExercises:  { parentTable: 'sessions',        field: 'sessionId'         },
  sets:              { parentTable: 'sessionExercises', field: 'sessionExerciseId' },
  templateExercises: { parentTable: 'templates',        field: 'templateId'        },
};

const TABLE_NAME_MAP: Record<string, string> = {
  muscleGroups:      'muscle_groups',
  sessionExercises:  'session_exercises',
  templateExercises: 'template_exercises',
  personalRecords:   'personal_records',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v: string) => UUID_RE.test(v);

function hasLegacyIds(recordId: string, payload: Record<string, unknown>): boolean {
  if (!isUUID(recordId)) return true;
  for (const [key, val] of Object.entries(payload)) {
    if (typeof val === 'string' && (key === 'id' || key.endsWith('Id')) && !isUUID(val)) {
      return true;
    }
  }
  return false;
}

function mapTable(t: string): string {
  return TABLE_NAME_MAP[t] ?? t;
}

function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const sk = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    out[sk] = v instanceof Object && !Array.isArray(v) && !(v instanceof Date)
      ? toSnakeCase(v as Record<string, unknown>)
      : v;
  }
  return out;
}

function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const ck = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[ck] = v instanceof Object && !Array.isArray(v) && !(v instanceof Date)
      ? toCamelCase(v as Record<string, unknown>)
      : v;
  }
  return out;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue a local change for upload.
 * Rejects legacy non-UUID IDs immediately. Also validates the
 * grandparent exercise chain for sets (sessionExercise.exerciseId).
 */
export async function enqueueSync(
  table: string,
  operation: SyncQueueItem['operation'],
  recordId: string,
  payload: object,
) {
  if (!isSupabaseConfigured) return;

  const { user } = useAuthStore.getState();
  if (!user?.id) {
    console.warn('[Sync] ⚠️ Cannot enqueue — no authenticated user', { table, recordId });
    return;
  }

  const fullPayload = { ...payload, user_id: user.id };

  if (hasLegacyIds(recordId, fullPayload as Record<string, unknown>)) {
    console.warn(`[Sync] ⚠️ Skipping legacy non-UUID record: ${table}:${recordId}`);
    return;
  }

  // Validate grandparent exerciseId for sets (their own payload is UUID-valid
  // but the parent sessionExercise might reference a legacy exercise)
  if (table === 'sets') {
    const seId = (fullPayload as Record<string, unknown>).sessionExerciseId as string | undefined;
    if (seId) {
      const se = await db.sessionExercises.get(seId);
      if (se && !isUUID(se.exerciseId)) {
        console.warn(`[Sync] ⚠️ Skipping set — legacy exerciseId on parent: ${se.exerciseId}`);
        return;
      }
    }
  }

  await db.syncQueue.add({
    id: crypto.randomUUID(),
    table,
    operation,
    recordId,
    payload: JSON.stringify(fullPayload),
    createdAt: new Date(),
    retries: 0,
  });
}

/**
 * Full initial sync on login (runs once per user session).
 * 1. Pull all existing cloud data into Dexie (last-write-wins)
 * 2. Push ALL local data to Supabase in FK-safe order
 *    so nothing is missing when the ongoing queue runs
 */
export async function initialSync(userId: string) {
  if (!isSupabaseConfigured || !supabase) return;

  // Deduplicate: Supabase fires SIGNED_IN + INITIAL_SESSION on the same login
  if (lastInitializedUserId === userId) return;
  lastInitializedUserId = userId;

  console.log(`[Sync] 🔄 Initial sync for ${userId.slice(0, 8)}…`);
  await pullFromSupabase(userId);
  await pushAllLocalData(userId);
  console.log(`[Sync] ✅ Initial sync complete`);
}

export async function pullFromSupabase(userId: string) {
  if (!isSupabaseConfigured || !supabase) return;
  console.log(`[Sync] 📥 Pulling for ${userId.slice(0, 8)}…`);

  const PULL_ORDER = [
    'muscleGroups',
    'exercises',
    'sessions',
    'templates',
    'sessionExercises',
    'templateExercises',
    'sets',
    'personalRecords',
  ] as const;

  for (const table of PULL_ORDER) {
    try {
      const { data, error } = await supabase
        .from(mapTable(table))
        .select('*')
        .eq('user_id', userId);
      if (error) throw error;
      if (!data?.length) continue;

      console.log(`[Sync]   ${table}: ${data.length} pulled`);
      const rows = data.map((r) => toCamelCase(r as Record<string, unknown>));
      const dexieTable = db[table as keyof typeof db];
      if (dexieTable && typeof (dexieTable as { bulkPut?: unknown }).bulkPut === 'function') {
        await (dexieTable as { bulkPut: (d: unknown[]) => Promise<unknown> }).bulkPut(rows);
      }
    } catch (err) {
      console.error(`[Sync] ❌ Pull failed for ${table}`, err);
    }
  }
}

/**
 * Upsert all local Dexie data to Supabase.
 * Idempotent (uses onConflict: 'id') — safe to run on every login or after bulk import.
 * Order respects Supabase FK constraints.
 */
export async function pushAllLocalData(userId: string) {
  if (!supabase) return;
  console.log('[Sync] 📤 Pushing all local data…');

  const upsert = async (table: string, rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return;
    const snakeRows = rows.map((r) => toSnakeCase({ ...r, userId }));
    const { error } = await supabase!
      .from(mapTable(table))
      .upsert(snakeRows, { onConflict: 'id' });
    if (error) console.error(`[Sync] ❌ Failed to push ${table}`, error);
    else console.log(`[Sync]   ${table}: pushed ${rows.length}`);
  };

  // 1. muscle_groups — no FK deps
  const muscleGroups = (await db.muscleGroups.toArray()).filter((mg) => isUUID(mg.id));
  await upsert('muscleGroups', muscleGroups as unknown as Record<string, unknown>[]);

  // 2. exercises — FK → muscle_groups (guard both id and muscleGroupId)
  const exercises = (await db.exercises.toArray()).filter(
    (ex) => isUUID(ex.id) && isUUID(ex.muscleGroupId),
  );
  await upsert('exercises', exercises as unknown as Record<string, unknown>[]);

  // 3. sessions & templates — no FK deps (other than user)
  await upsert('sessions', (await db.sessions.toArray()) as unknown as Record<string, unknown>[]);
  await upsert('templates', (await db.templates.toArray()) as unknown as Record<string, unknown>[]);

  // 4. sessionExercises — FK → sessions + exercises
  const validExIds = new Set(exercises.map((e) => e.id));
  const sessionExercises = (await db.sessionExercises.toArray())
    .filter((se) => validExIds.has(se.exerciseId));
  await upsert('sessionExercises', sessionExercises as unknown as Record<string, unknown>[]);

  // 5. templateExercises — FK → templates + exercises
  const templateExercises = (await db.templateExercises.toArray())
    .filter((te) => validExIds.has(te.exerciseId));
  await upsert('templateExercises', templateExercises as unknown as Record<string, unknown>[]);

  // 6. sets — FK → sessionExercises
  const validSeIds = new Set(sessionExercises.map((se) => se.id));
  const sets = (await db.sets.toArray())
    .filter((s) => validSeIds.has(s.sessionExerciseId));
  await upsert('sets', sets as unknown as Record<string, unknown>[]);

  // 7. personalRecords — FK → exercises + sessions
  const validSessionIds = new Set((await db.sessions.toArray()).map((s) => s.id));
  const personalRecords = (await db.personalRecords.toArray())
    .filter((pr) => validExIds.has(pr.exerciseId) && validSessionIds.has(pr.sessionId));
  await upsert('personalRecords', personalRecords as unknown as Record<string, unknown>[]);
}

export function startSync() {
  if (!isSupabaseConfigured || syncIntervalId) return;
  console.log('[Sync] 🟢 Started (interval: 30s)');
  drainSyncQueue().catch(console.error);
  syncIntervalId = setInterval(() => drainSyncQueue().catch(console.error), SYNC_INTERVAL_MS);
}

export function stopSync() {
  if (!syncIntervalId) return;
  console.log('[Sync] 🔴 Stopped');
  clearInterval(syncIntervalId);
  syncIntervalId = null;
  lastInitializedUserId = null; // allow re-init on next login
}

export async function clearSyncQueue() {
  const count = await db.syncQueue.count();
  await db.syncQueue.clear();
  console.log(`[Sync] 🗑️ Cleared ${count} items`);
  return count;
}

// ─── Queue drain ──────────────────────────────────────────────────────────────

async function drainSyncQueue() {
  if (!isSupabaseConfigured || !supabase) return;

  const raw = await db.syncQueue.orderBy('createdAt').limit(50).toArray();
  if (raw.length === 0) return;

  const tableIdx = (t: string) => QUEUE_TABLE_ORDER.indexOf(t as QueueTable);

  const items = [
    ...raw.filter((i) => i.operation !== 'delete')
         .sort((a, b) => tableIdx(a.table) - tableIdx(b.table)),
    ...raw.filter((i) => i.operation === 'delete')
         .sort((a, b) => tableIdx(b.table) - tableIdx(a.table)),
  ];

  console.log(`[Sync] 📤 Draining ${items.length} items`);

  // Pending ID sets for FK guard (in-memory, avoids unindexed Dexie queries)
  const pending = new Map<string, Set<string>>();
  for (const q of raw) {
    if (!pending.has(q.table)) pending.set(q.table, new Set());
    pending.get(q.table)!.add(q.recordId);
  }

  for (const item of items) {
    try {
      const payload = JSON.parse(item.payload) as Record<string, unknown>;

      // Purge: too many retries or legacy IDs that slipped through
      if (item.retries >= MAX_RETRIES || hasLegacyIds(item.recordId, payload)) {
        console.warn(`[Sync] 🗑️ Purging: ${item.table}:${item.recordId} (retries: ${item.retries})`);
        await db.syncQueue.delete(item.id);
        pending.get(item.table)?.delete(item.recordId);
        continue;
      }

      // FK guard: defer child until parent is synced
      if (item.operation !== 'delete') {
        const dep = FK_DEPS[item.table];
        if (dep) {
          const parentId = payload[dep.field] as string | undefined;
          if (parentId && pending.get(dep.parentTable)?.has(parentId)) {
            console.log(`[Sync] ⏭️ Deferring ${item.table}:${item.recordId} (parent pending)`);
            continue;
          }
        }
      }

      if (item.operation === 'delete') {
        const { error } = await supabase.from(mapTable(item.table)).delete().eq('id', item.recordId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(mapTable(item.table))
          .upsert(toSnakeCase(payload), { onConflict: 'id' });
        if (error) throw error;
      }

      console.log(`[Sync] ✅ ${item.operation} ${item.table}:${item.recordId}`);
      pending.get(item.table)?.delete(item.recordId);
      await db.syncQueue.delete(item.id);
    } catch (err) {
      console.error(`[Sync] ❌ ${item.table}:${item.recordId}`, err);
      await db.syncQueue.update(item.id, { retries: item.retries + 1 });
    }
  }
}

// Expose for console debugging
if (typeof window !== 'undefined') {
  (window as any).clearSyncQueue = clearSyncQueue;
}
