import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, ArrowLeft, Copy, CalendarDays } from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isSameDay, isSameMonth, isToday, addMonths, subMonths,
} from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '@/db/schema';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/components/ui/Toast';
import { clsx } from 'clsx';
import type { Session } from '@/types/entities';

const WEEKDAYS_MON = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAYS_SUN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ─── Full session copy (sets + all fields) with merge support ──────────────────
async function copySession(sourceId: string, targetDate: string): Promise<string> {
  let targetSession = await db.sessions.where('date').equals(targetDate).first();
  if (!targetSession) {
    targetSession = {
      id: crypto.randomUUID(),
      date: targetDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.sessions.add(targetSession);
  }
  const targetSessionId = targetSession.id;

  const sourceExercises = await db.sessionExercises
    .where('sessionId').equals(sourceId).sortBy('order');
  const targetExercises = await db.sessionExercises
    .where('sessionId').equals(targetSessionId).toArray();
  let maxTargetOrder = targetExercises.reduce((m, se) => Math.max(m, se.order), 0);

  for (const se of sourceExercises) {
    const sourceSets = await db.sets.where('sessionExerciseId').equals(se.id).sortBy('order');
    const existingTargetSE = targetExercises.find((tse) => tse.exerciseId === se.exerciseId);

    if (existingTargetSE) {
      const existingSets = await db.sets.where('sessionExerciseId').equals(existingTargetSE.id).sortBy('order');
      let nextOrder = existingSets.reduce((m, s) => Math.max(m, s.order), 0);
      const now = new Date();
      for (const set of sourceSets) {
        nextOrder++;
        await db.sets.add({
          id: crypto.randomUUID(),
          sessionExerciseId: existingTargetSE.id,
          order: nextOrder,
          weight: set.weight, reps: set.reps,
          duration: set.duration, distance: set.distance,
          rpe: set.rpe, notes: set.notes, isWarmup: set.isWarmup,
          createdAt: now, updatedAt: now,
        });
      }
    } else {
      maxTargetOrder++;
      const now = new Date();
      const newSE = {
        id: crypto.randomUUID(),
        sessionId: targetSessionId,
        exerciseId: se.exerciseId,
        order: maxTargetOrder,
        createdAt: now,
        updatedAt: now,
      };
      await db.sessionExercises.add(newSE);
      for (const set of sourceSets) {
        await db.sets.add({
          id: crypto.randomUUID(),
          sessionExerciseId: newSE.id,
          order: set.order,
          weight: set.weight, reps: set.reps,
          duration: set.duration, distance: set.distance,
          rpe: set.rpe, notes: set.notes, isWarmup: set.isWarmup,
          createdAt: now, updatedAt: now,
        });
      }
    }
  }
  return targetSessionId;
}

type PanelView = 'day' | 'pick-source' | 'pick-target';

export function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dayPanelOpen, setDayPanelOpen] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>('day');
  const [copying, setCopying] = useState(false);
  const [targetMonth, setTargetMonth] = useState(new Date());

  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const firstDay = settings.firstDayOfWeek;
  const weekdays = firstDay === 1 ? WEEKDAYS_MON : WEEKDAYS_SUN;

  // ── Calendar data ─────────────────────────────────────────────────────────
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startStr = format(monthStart, 'yyyy-MM-dd');
  const endStr = format(monthEnd, 'yyyy-MM-dd');

  const sessions = useLiveQuery(
    () => db.sessions.where('date').between(startStr, endStr, true, true).toArray(),
    [startStr, endStr],
  );

  const muscleGroups = useLiveQuery(() => db.muscleGroups.toArray(), []);
  const mgMap = useMemo(
    () => new Map(muscleGroups?.map((mg) => [mg.id, mg]) ?? []),
    [muscleGroups],
  );

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    if (!sessions) return map;
    for (const s of sessions) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [sessions]);

  const sessionIds = useMemo(() => sessions?.map((s) => s.id) ?? [], [sessions]);

  const sessionExercises = useLiveQuery(
    async () => {
      if (sessionIds.length === 0) return [];
      return db.sessionExercises.where('sessionId').anyOf(sessionIds).toArray();
    },
    [sessionIds.join(',')],
  );

  const nonEmptySessionIds = useMemo(() => {
    const set = new Set<string>();
    if (!sessionExercises) return set;
    for (const se of sessionExercises) set.add(se.sessionId);
    return set;
  }, [sessionExercises]);

  const sessionsByDateFiltered = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const [date, list] of sessionsByDate) {
      const filtered = list.filter((s) => nonEmptySessionIds.has(s.id));
      if (filtered.length > 0) map.set(date, filtered);
    }
    return map;
  }, [sessionsByDate, nonEmptySessionIds]);

  const exerciseIds = useMemo(
    () => [...new Set(sessionExercises?.map((se) => se.exerciseId) ?? [])],
    [sessionExercises],
  );
  const exercises = useLiveQuery(
    async () => {
      if (exerciseIds.length === 0) return [];
      return db.exercises.where('id').anyOf(exerciseIds).toArray();
    },
    [exerciseIds.join(',')],
  );

  const exerciseMap = useMemo(
    () => new Map(exercises?.map((e) => [e.id, e]) ?? []),
    [exercises],
  );

  const sessionColors = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!sessionExercises) return map;
    for (const se of sessionExercises) {
      const ex = exerciseMap.get(se.exerciseId);
      if (!ex) continue;
      const mg = mgMap.get(ex.muscleGroupId);
      if (!mg) continue;
      const colors = map.get(se.sessionId) ?? [];
      if (!colors.includes(mg.color)) colors.push(mg.color);
      map.set(se.sessionId, colors);
    }
    return map;
  }, [sessionExercises, exerciseMap, mgMap]);

  const calendarDays = useMemo(() => buildGrid(currentMonth, firstDay), [currentMonth, firstDay]);

  const handleDayTap = useCallback((day: Date) => {
    setSelectedDate(day);
    setPanelView('day');
    setDayPanelOpen(true);
  }, []);

  // ── Selected day data ─────────────────────────────────────────────────────
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const selectedSessions = sessionsByDateFiltered.get(selectedDateStr) ?? [];
  const hasSession = selectedSessions.length > 0;

  const selectedSessionExercises = useLiveQuery(
    async () => {
      if (!hasSession) return [];
      const sIds = selectedSessions.map((s) => s.id);
      const ses = await db.sessionExercises.where('sessionId').anyOf(sIds).sortBy('order');
      const exIds = [...new Set(ses.map((se) => se.exerciseId))];
      const exs = await db.exercises.where('id').anyOf(exIds).toArray();
      const exMap = new Map(exs.map((e) => [e.id, e]));
      return ses.map((se) => ({ ...se, exercise: exMap.get(se.exerciseId) }));
    },
    [selectedDateStr, selectedSessions.map((s) => s.id).join(',')],
  );

  // ── All sessions for pick-source ──────────────────────────────────────────
  const allSessions = useLiveQuery(() => db.sessions.orderBy('date').reverse().toArray(), []);

  const allSessionSummaries = useLiveQuery(async () => {
    if (!allSessions) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const s of allSessions) {
      const ses = await db.sessionExercises.where('sessionId').equals(s.id).toArray();
      const exIds = ses.map((se) => se.exerciseId);
      const exs = await db.exercises.where('id').anyOf(exIds).toArray();
      map.set(s.id, exs.map((e) => e.name));
    }
    return map;
  }, [allSessions?.map((s) => s.id).join(',')]);

  const allNonEmptySessions = useMemo(() => {
    if (!allSessions || !allSessionSummaries) return [];
    return allSessions.filter((s) => (allSessionSummaries.get(s.id) ?? []).length > 0);
  }, [allSessions, allSessionSummaries]);

  const allNonEmptySessionDates = useMemo(() => {
    const set = new Set<string>();
    if (!allSessions || !allSessionSummaries) return set;
    for (const s of allSessions) {
      if ((allSessionSummaries.get(s.id) ?? []).length > 0) set.add(s.date);
    }
    return set;
  }, [allSessions, allSessionSummaries]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function closePanel() {
    setDayPanelOpen(false);
    setPanelView('day');
  }

  async function handleNewSession() {
    const session: Session = {
      id: crypto.randomUUID(),
      date: selectedDateStr,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.sessions.add(session);
    closePanel();
    navigate(`/session/${session.id}`);
  }

  async function handleCopyFrom(sourceSession: Session) {
    setCopying(true);
    try {
      const newId = await copySession(sourceSession.id, selectedDateStr);
      closePanel();
      navigate(`/session/${newId}`);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setCopying(false);
    }
  }

  async function handleCopyTo(targetDate: Date) {
    const targetDateStr = format(targetDate, 'yyyy-MM-dd');
    const sourceSession = selectedSessions[0];
    if (!sourceSession) return;
    setCopying(true);
    try {
      const newId = await copySession(sourceSession.id, targetDateStr);
      closePanel();
      navigate(`/session/${newId}`);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setCopying(false);
    }
  }

  const targetCalendarDays = useMemo(() => buildGrid(targetMonth, firstDay), [targetMonth, firstDay]);

  const panelTitle =
    panelView === 'pick-source' ? 'Copy from…'
    : panelView === 'pick-target' ? 'Copy to…'
    : format(selectedDate, 'EEEE d MMMM');

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full bg-surface-base">

      {/* ── Month navigation ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button
          className="h-9 w-9 flex items-center justify-center rounded-xl text-text-secondary active:bg-surface-raised transition-colors duration-fast"
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
        >
          <ChevronLeft size={20} strokeWidth={1.75} />
        </button>

        <div className="flex flex-col items-center">
          <h2 className="text-base font-semibold text-text-primary capitalize leading-tight">
            {format(currentMonth, 'MMMM')}
          </h2>
          <span className="text-xs text-text-secondary font-mono">
            {format(currentMonth, 'yyyy')}
          </span>
        </div>

        <button
          className="h-9 w-9 flex items-center justify-center rounded-xl text-text-secondary active:bg-surface-raised transition-colors duration-fast"
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight size={20} strokeWidth={1.75} />
        </button>
      </div>

      {/* ── Weekday headers ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 px-3 pb-1">
        {weekdays.map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-text-muted tracking-wider py-1">
            {d}
          </div>
        ))}
      </div>

      {/* ── Calendar grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 px-3 gap-y-0.5 flex-1">
        {calendarDays.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const daySessions = sessionsByDateFiltered.get(dateStr) ?? [];
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDay = isToday(day);
          const hasWorkout = daySessions.length > 0;

          // Up to 3 muscle-group color dots
          const dots: string[] = [];
          for (const s of daySessions) {
            for (const c of sessionColors.get(s.id) ?? []) {
              if (!dots.includes(c) && dots.length < 3) dots.push(c);
            }
          }

          return (
            <button
              key={i}
              onClick={() => handleDayTap(day)}
              className={clsx(
                'flex flex-col items-center justify-center gap-0.5 py-1.5 transition-all duration-fast',
                !isSelected && 'active:scale-95',
                !isCurrentMonth && 'opacity-25 pointer-events-none',
              )}
            >
              {/* Number circle */}
              <span
                className={clsx(
                  'h-9 w-9 flex items-center justify-center rounded-full text-sm font-medium transition-all duration-fast',
                  isSelected
                    ? 'bg-accent text-white shadow-accent-glow font-semibold'
                    : isTodayDay
                      ? 'text-accent font-bold ring-2 ring-accent/40'
                      : hasWorkout
                        ? 'text-text-primary'
                        : 'text-text-secondary',
                )}
              >
                {format(day, 'd')}
              </span>

              {/* Muscle dots */}
              <div className="h-2 flex items-center gap-0.5">
                {dots.map((color, di) => (
                  <span
                    key={di}
                    className="h-1.5 w-1.5 rounded-full transition-all"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Day panel ─────────────────────────────────────────────────────── */}
      <BottomSheet isOpen={dayPanelOpen} onClose={closePanel} title={panelTitle}>

        {/* ─ Day summary view ─ */}
        {panelView === 'day' && (
          <div className="px-4 py-3 flex flex-col gap-3 pb-6">

            {/* Exercise list */}
            {hasSession && selectedSessionExercises && selectedSessionExercises.length > 0 && (
              <div className="bg-surface-raised rounded-2xl overflow-hidden">
                {selectedSessionExercises.map((se, idx) => {
                  const mg = se.exercise ? mgMap.get(se.exercise.muscleGroupId) : undefined;
                  return (
                    <div
                      key={se.id}
                      className={clsx(
                        'flex items-center gap-3 px-4 py-3',
                        idx < selectedSessionExercises.length - 1 && 'border-b border-border/40',
                      )}
                    >
                      {mg && (
                        <span
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: mg.color }}
                        />
                      )}
                      <span className="text-sm text-text-primary flex-1 min-w-0 truncate">
                        {se.exercise?.name ?? '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {!hasSession && (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <div className="h-12 w-12 rounded-2xl bg-surface-raised flex items-center justify-center">
                  <CalendarDays size={22} className="text-text-muted" />
                </div>
                <p className="text-sm text-text-secondary">Aucune séance ce jour.</p>
              </div>
            )}

            {/* Actions */}
            {hasSession && (
              <div className="flex flex-col gap-2">
                <Button
                  fullWidth
                  onClick={() => { closePanel(); navigate(`/session/${selectedSessions[0].id}`); }}
                >
                  Ouvrir la séance
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => { setTargetMonth(new Date()); setPanelView('pick-target'); }}
                >
                  <Copy size={15} />
                  Copier vers un autre jour
                </Button>
              </div>
            )}

            {!hasSession && (
              <div className="flex flex-col gap-2">
                <Button fullWidth onClick={handleNewSession}>
                  <Plus size={16} />
                  Nouvelle séance
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => setPanelView('pick-source')}
                >
                  <Copy size={15} />
                  Copier une séance précédente
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ─ Pick source view ─ */}
        {panelView === 'pick-source' && (
          <div className="flex flex-col">
            <button
              className="flex items-center gap-2 px-4 py-3 text-sm text-text-secondary border-b border-border/50"
              onClick={() => setPanelView('day')}
            >
              <ArrowLeft size={15} />
              <span>Retour</span>
            </button>

            <div className="overflow-y-auto max-h-[60dvh]">
              {!allNonEmptySessions || allNonEmptySessions.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
                  <p className="text-sm text-text-secondary">Aucune séance passée trouvée.</p>
                </div>
              ) : (
                allNonEmptySessions
                  .filter((s) => s.date !== selectedDateStr)
                  .map((s) => {
                    const names = allSessionSummaries?.get(s.id) ?? [];
                    return (
                      <button
                        key={s.id}
                        disabled={copying}
                        onClick={() => handleCopyFrom(s)}
                        className="w-full flex items-start gap-3 px-4 py-3.5 border-b border-border/40 active:bg-surface-raised text-left transition-colors duration-fast last:border-b-0"
                      >
                        <div className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-xl bg-surface-overlay flex items-center justify-center">
                          <CalendarDays size={14} className="text-text-secondary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-text-primary block">
                            {format(new Date(s.date + 'T00:00:00'), 'EEE d MMM yyyy')}
                          </span>
                          {names.length > 0 ? (
                            <span className="text-xs text-text-secondary truncate block mt-0.5">
                              {names.slice(0, 4).join(' · ')}
                              {names.length > 4 && ` +${names.length - 4}`}
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted italic">Séance vide</span>
                          )}
                        </div>
                      </button>
                    );
                  })
              )}
            </div>
          </div>
        )}

        {/* ─ Pick target view ─ */}
        {panelView === 'pick-target' && (
          <div className="flex flex-col gap-3 pb-6">
            <button
              className="flex items-center gap-2 px-4 py-3 text-sm text-text-secondary border-b border-border/50"
              onClick={() => setPanelView('day')}
            >
              <ArrowLeft size={15} />
              <span>Retour</span>
            </button>

            {/* Mini calendar navigation */}
            <div className="flex items-center justify-between px-4">
              <button
                className="h-8 w-8 flex items-center justify-center rounded-xl text-text-secondary active:bg-surface-raised transition-colors duration-fast"
                onClick={() => setTargetMonth((m) => subMonths(m, 1))}
              >
                <ChevronLeft size={17} strokeWidth={1.75} />
              </button>
              <span className="text-sm font-semibold text-text-primary capitalize">
                {format(targetMonth, 'MMMM yyyy')}
              </span>
              <button
                className="h-8 w-8 flex items-center justify-center rounded-xl text-text-secondary active:bg-surface-raised transition-colors duration-fast"
                onClick={() => setTargetMonth((m) => addMonths(m, 1))}
              >
                <ChevronRight size={17} strokeWidth={1.75} />
              </button>
            </div>

            {/* Mini weekday headers */}
            <div className="grid grid-cols-7 px-4">
              {weekdays.map((d) => (
                <div key={d} className="text-center text-[10px] font-semibold text-text-muted tracking-wider py-0.5">
                  {d[0]}
                </div>
              ))}
            </div>

            {/* Mini grid */}
            <div className="grid grid-cols-7 px-4 gap-y-1">
              {targetCalendarDays.map((day, i) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isSource = isSameDay(day, selectedDate);
                const willMerge = !isSource && (allNonEmptySessionDates?.has(dateStr) ?? false);
                const isCurrentMonth = isSameMonth(day, targetMonth);
                const isTodayDay = isToday(day);

                return (
                  <button
                    key={i}
                    disabled={isSource || copying}
                    onClick={() => handleCopyTo(day)}
                    className={clsx(
                      'flex flex-col items-center justify-center h-10 rounded-full text-sm font-medium',
                      'transition-all duration-fast',
                      !isSource && 'active:scale-90 active:bg-accent/20',
                      !isCurrentMonth && 'opacity-25',
                      isSource && 'opacity-30 cursor-not-allowed',
                      !isSource && isTodayDay && 'ring-2 ring-accent/40',
                      willMerge && 'text-accent',
                      !isSource && !willMerge && 'text-text-primary',
                    )}
                  >
                    {format(day, 'd')}
                    {willMerge && (
                      <span className="h-1 w-1 rounded-full bg-accent -mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-text-secondary text-center px-6">
              <span className="text-accent font-semibold">Bleu</span> = merge avec la séance existante
            </p>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

// ─── Grid builder ─────────────────────────────────────────────────────────────

function buildGrid(month: Date, firstDay: 0 | 1): Date[] {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start, end });

  const startDow = getDay(start);
  const offset = firstDay === 1 ? (startDow === 0 ? 6 : startDow - 1) : startDow;
  const padStart = Array.from({ length: offset }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() - offset + i);
    return d;
  });

  const total = padStart.length + days.length;
  const remainder = total % 7;
  const padEnd = remainder === 0
    ? []
    : Array.from({ length: 7 - remainder }, (_, i) => {
        const d = new Date(end);
        d.setDate(d.getDate() + i + 1);
        return d;
      });

  return [...padStart, ...days, ...padEnd];
}
