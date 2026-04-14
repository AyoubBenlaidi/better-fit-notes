import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, ArrowLeft, Copy, CalendarDays } from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isSameDay, isSameMonth, isToday, addMonths, subMonths,
} from 'date-fns';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Spinner } from '@/components/ui/Spinner';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/components/ui/Toast';
import { clsx } from 'clsx';
import type { Session } from '@/types/entities';
import {
  getSessions, getMuscleGroups, getExercises, getSessionExercises,
  createSession, copySession as apiCopySession,
} from '@/lib/api';

const WEEKDAYS_MON = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAYS_SUN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type PanelView = 'day' | 'pick-source' | 'pick-target';

export function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dayPanelOpen, setDayPanelOpen] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>('day');
  const [targetMonth, setTargetMonth] = useState(new Date());

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { settings } = useSettingsStore();
  const { user } = useAuthStore();
  const firstDay = settings.firstDayOfWeek;
  const weekdays = firstDay === 1 ? WEEKDAYS_MON : WEEKDAYS_SUN;

  // Global refetch is handled by App.tsx after Zustand rehydration

  const { data: sessions } = useQuery({
    queryKey: ['sessions', user?.id],
    queryFn: () => getSessions(user!.id),
    enabled: !!user,
  });

  const { data: muscleGroups } = useQuery({
    queryKey: ['muscleGroups', user?.id],
    queryFn: () => getMuscleGroups(user!.id),
    enabled: !!user,
    staleTime: Infinity,
  });

  const { data: allExercises } = useQuery({
    queryKey: ['exercises', user?.id],
    queryFn: () => getExercises(user!.id),
    enabled: !!user,
    staleTime: Infinity,
  });

  const mgMap = useMemo(
    () => new Map(muscleGroups?.map((mg) => [mg.id, mg]) ?? []),
    [muscleGroups],
  );
  const exerciseMap = useMemo(
    () => new Map(allExercises?.map((e) => [e.id, e]) ?? []),
    [allExercises],
  );

  // Only fetch session exercises for sessions in the visible month — same cache keys as SessionPage
  const sessionsInView = useMemo(() => {
    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
    return (sessions ?? []).filter((s) => s.date >= monthStart && s.date <= monthEnd);
  }, [sessions, currentMonth]);

  const sessionExerciseQueries = useQueries({
    queries: sessionsInView.map((s) => ({
      queryKey: ['sessionExercises', s.id],
      queryFn: () => getSessionExercises(s.id),
    })),
  });

  const allSessionExercises = useMemo(
    () => sessionExerciseQueries.flatMap((q) => q.data ?? []),
    [sessionExerciseQueries],
  );

  // Sessions with at least one exercise
  const nonEmptySessionIds = useMemo(() => {
    const set = new Set<string>();
    for (const se of allSessionExercises) set.add(se.sessionId);
    return set;
  }, [allSessionExercises]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions ?? []) {
      if (!nonEmptySessionIds.has(s.id)) continue;
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [sessions, nonEmptySessionIds]);

  // Muscle-group color dots per session
  const sessionColors = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const se of allSessionExercises ?? []) {
      const ex = exerciseMap.get(se.exerciseId);
      if (!ex) continue;
      const mg = mgMap.get(ex.muscleGroupId);
      if (!mg) continue;
      const colors = map.get(se.sessionId) ?? [];
      if (!colors.includes(mg.color)) colors.push(mg.color);
      map.set(se.sessionId, colors);
    }
    return map;
  }, [allSessionExercises, exerciseMap, mgMap]);

  // Exercise names per session (for pick-source list)
  const sessionExerciseNames = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const se of allSessionExercises ?? []) {
      const ex = exerciseMap.get(se.exerciseId);
      if (!ex) continue;
      const names = map.get(se.sessionId) ?? [];
      if (!names.includes(ex.name)) names.push(ex.name);
      map.set(se.sessionId, names);
    }
    return map;
  }, [allSessionExercises, exerciseMap]);

  // For pick-source: all sessions ever (exercise names only shown when cached from current month)
  const allNonEmptySessions = useMemo(() => sessions ?? [], [sessions]);

  const allNonEmptySessionDates = useMemo(
    () => new Set(allNonEmptySessions.map((s) => s.date)),
    [allNonEmptySessions],
  );

  const calendarDays = useMemo(() => buildGrid(currentMonth, firstDay), [currentMonth, firstDay]);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const selectedSessions = sessionsByDate.get(selectedDateStr) ?? [];
  const hasSession = selectedSessions.length > 0;

  // Exercises shown in day panel
  const selectedSessionExercises = useMemo(() => {
    const sIds = new Set(selectedSessions.map((s) => s.id));
    return (allSessionExercises ?? [])
      .filter((se) => sIds.has(se.sessionId))
      .sort((a, b) => a.order - b.order)
      .map((se) => ({ ...se, exercise: exerciseMap.get(se.exerciseId) }));
  }, [selectedSessions, allSessionExercises, exerciseMap]);

  const handleDayTap = useCallback((day: Date) => {
    setSelectedDate(day);
    setPanelView('day');
    setDayPanelOpen(true);
  }, []);

  function closePanel() {
    setDayPanelOpen(false);
    setPanelView('day');
  }

  const newSessionMutation = useMutation({
    mutationFn: () => createSession(user!.id, { id: crypto.randomUUID(), date: selectedDateStr }),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', user?.id] });
      closePanel();
      navigate(`/session/${session.id}`);
    },
    onError: (err) => toast((err as Error).message, 'error'),
  });

  const copyMutation = useMutation({
    mutationFn: ({ sourceSessionId, targetDate }: { sourceSessionId: string; targetDate: string }) =>
      apiCopySession(user!.id, sourceSessionId, targetDate),
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['allSessionExercises', user?.id] });
      // Invalidate analytics cache since new exercises were copied
      queryClient.invalidateQueries({ queryKey: ['sessionStats'] });
      queryClient.invalidateQueries({ queryKey: ['volumeStats'] });
      closePanel();
      navigate(`/session/${newId}`);
    },
    onError: (err) => toast((err as Error).message, 'error'),
  });

  const targetCalendarDays = useMemo(() => buildGrid(targetMonth, firstDay), [targetMonth, firstDay]);

  const panelTitle =
    panelView === 'pick-source' ? 'Copy from…'
    : panelView === 'pick-target' ? 'Copy to…'
    : format(selectedDate, 'EEEE d MMMM');

  return (
    <div className="flex flex-col min-h-full bg-surface-base">
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
          <span className="text-xs text-text-secondary font-mono">{format(currentMonth, 'yyyy')}</span>
        </div>
        <button
          className="h-9 w-9 flex items-center justify-center rounded-xl text-text-secondary active:bg-surface-raised transition-colors duration-fast"
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight size={20} strokeWidth={1.75} />
        </button>
      </div>

      <div className="grid grid-cols-7 px-3 pb-1">
        {weekdays.map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-text-muted tracking-wider py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 px-3 gap-y-0.5 flex-1">
        {calendarDays.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const daySessions = sessionsByDate.get(dateStr) ?? [];
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDay = isToday(day);
          const hasWorkout = daySessions.length > 0;

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
              <span className={clsx(
                'h-9 w-9 flex items-center justify-center rounded-full text-sm font-medium transition-all duration-fast',
                isSelected ? 'bg-accent text-white shadow-accent-glow font-semibold'
                  : isTodayDay ? 'text-accent font-bold ring-2 ring-accent/40'
                  : hasWorkout ? 'text-text-primary'
                  : 'text-text-secondary',
              )}>
                {format(day, 'd')}
              </span>
              <div className="h-2 flex items-center gap-0.5">
                {dots.map((color, di) => (
                  <span key={di} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <BottomSheet isOpen={dayPanelOpen} onClose={closePanel} title={panelTitle}>
        {panelView === 'day' && (
          <div className="px-4 py-3 flex flex-col gap-3 pb-6">
            {hasSession && selectedSessionExercises.length > 0 && (
              <div className="bg-surface-raised rounded-2xl overflow-hidden">
                {selectedSessionExercises.map((se, idx) => {
                  const mg = se.exercise ? mgMap.get(se.exercise.muscleGroupId) : undefined;
                  return (
                    <div key={se.id} className={clsx('flex items-center gap-3 px-4 py-3', idx < selectedSessionExercises.length - 1 && 'border-b border-border/40')}>
                      {mg && <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: mg.color }} />}
                      <span className="text-sm text-text-primary flex-1 min-w-0 truncate">{se.exercise?.name ?? '—'}</span>
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

            {hasSession && (
              <div className="flex flex-col gap-2">
                <Button fullWidth onClick={() => { closePanel(); navigate(`/session/${selectedSessions[0].id}`); }}>
                  Ouvrir la séance
                </Button>
                <Button variant="secondary" fullWidth onClick={() => { setTargetMonth(new Date()); setPanelView('pick-target'); }}>
                  <Copy size={15} />
                  Copier vers un autre jour
                </Button>
              </div>
            )}

            {!hasSession && (
              <div className="flex flex-col gap-2">
                <Button fullWidth loading={newSessionMutation.isPending} onClick={() => newSessionMutation.mutate()}>
                  {newSessionMutation.isPending ? (
                    <Spinner variant="inline" size="sm" />
                  ) : (
                    <Plus size={16} />
                  )}
                  {newSessionMutation.isPending ? 'Création…' : 'Nouvelle séance'}
                </Button>
                <Button variant="secondary" fullWidth onClick={() => setPanelView('pick-source')} disabled={copyMutation.isPending}>
                  <Copy size={15} />
                  Copier une séance précédente
                </Button>
              </div>
            )}
          </div>
        )}

        {panelView === 'pick-source' && (
          <div className="flex flex-col">
            <button className="flex items-center gap-2 px-4 py-3 text-sm text-text-secondary border-b border-border/50" onClick={() => setPanelView('day')}>
              <ArrowLeft size={15} /><span>Retour</span>
            </button>
            <div className="overflow-y-auto max-h-[60dvh]">
              {allNonEmptySessions.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
                  <p className="text-sm text-text-secondary">Aucune séance passée trouvée.</p>
                </div>
              ) : (
                allNonEmptySessions
                  .filter((s) => s.date !== selectedDateStr)
                  .map((s) => {
                    const names = sessionExerciseNames.get(s.id) ?? [];
                    return (
                      <button
                        key={s.id}
                        disabled={copyMutation.isPending}
                        onClick={() => copyMutation.mutate({ sourceSessionId: s.id, targetDate: selectedDateStr })}
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
                              {names.slice(0, 4).join(' · ')}{names.length > 4 && ` +${names.length - 4}`}
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

        {panelView === 'pick-target' && (
          <div className="flex flex-col gap-3 pb-6">
            <button className="flex items-center gap-2 px-4 py-3 text-sm text-text-secondary border-b border-border/50" onClick={() => setPanelView('day')}>
              <ArrowLeft size={15} /><span>Retour</span>
            </button>

            <div className="flex items-center justify-between px-4">
              <button className="h-8 w-8 flex items-center justify-center rounded-xl text-text-secondary active:bg-surface-raised transition-colors duration-fast" onClick={() => setTargetMonth((m) => subMonths(m, 1))}>
                <ChevronLeft size={17} strokeWidth={1.75} />
              </button>
              <span className="text-sm font-semibold text-text-primary capitalize">{format(targetMonth, 'MMMM yyyy')}</span>
              <button className="h-8 w-8 flex items-center justify-center rounded-xl text-text-secondary active:bg-surface-raised transition-colors duration-fast" onClick={() => setTargetMonth((m) => addMonths(m, 1))}>
                <ChevronRight size={17} strokeWidth={1.75} />
              </button>
            </div>

            <div className="grid grid-cols-7 px-4">
              {weekdays.map((d) => (
                <div key={d} className="text-center text-[10px] font-semibold text-text-muted tracking-wider py-0.5">{d[0]}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 px-4 gap-y-1">
              {targetCalendarDays.map((day, i) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isSource = isSameDay(day, selectedDate);
                const willMerge = !isSource && allNonEmptySessionDates.has(dateStr);
                const isCurrentMonth = isSameMonth(day, targetMonth);
                const isTodayDay = isToday(day);
                return (
                  <button
                    key={i}
                    disabled={isSource || copyMutation.isPending}
                    onClick={() => copyMutation.mutate({ sourceSessionId: selectedSessions[0].id, targetDate: dateStr })}
                    className={clsx(
                      'flex flex-col items-center justify-center h-10 rounded-full text-sm font-medium transition-all duration-fast',
                      !isSource && 'active:scale-90 active:bg-accent/20',
                      !isCurrentMonth && 'opacity-25',
                      isSource && 'opacity-30 cursor-not-allowed',
                      !isSource && isTodayDay && 'ring-2 ring-accent/40',
                      willMerge && 'text-accent',
                      !isSource && !willMerge && 'text-text-primary',
                    )}
                  >
                    {format(day, 'd')}
                    {willMerge && <span className="h-1 w-1 rounded-full bg-accent -mt-0.5" />}
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

      {copyMutation.isPending && (
        <Spinner variant="overlay" size="lg" label="Copie en cours…" />
      )}
    </div>
  );
}

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
