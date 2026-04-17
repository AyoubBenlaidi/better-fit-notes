import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Calendar } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Badge } from '@/components/ui/Badge';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/stores/authStore';
import { getSessions, getMuscleGroups, getExercises, getAllSessionExercises } from '@/lib/api';

export function HistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: sessions, isLoading } = useQuery({
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

  const { data: allSessionExercises } = useQuery({
    queryKey: ['allSessionExercises', user?.id],
    queryFn: () => getAllSessionExercises(user!.id),
    enabled: !!user,
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

  const sessionMuscleColors = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!allSessionExercises) return map;
    for (const se of allSessionExercises) {
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

  const sessionExerciseNames = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!allSessionExercises) return map;
    for (const se of allSessionExercises) {
      const ex = exerciseMap.get(se.exerciseId);
      if (!ex) continue;
      const names = map.get(se.sessionId) ?? [];
      if (!names.includes(ex.name)) names.push(ex.name);
      map.set(se.sessionId, names);
    }
    return map;
  }, [allSessionExercises, exerciseMap]);

  const sessionMgIds = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!allSessionExercises) return map;
    for (const se of allSessionExercises) {
      const ex = exerciseMap.get(se.exerciseId);
      if (!ex) continue;
      const ids = map.get(se.sessionId) ?? [];
      if (!ids.includes(ex.muscleGroupId)) ids.push(ex.muscleGroupId);
      map.set(se.sessionId, ids);
    }
    return map;
  }, [allSessionExercises, exerciseMap]);

  const groupedSessions = useMemo(() => {
    if (!sessions) return [];
    const groups: { month: string; items: typeof sessions }[] = [];
    let currentMonth = '';
    for (const session of sessions) {
      const month = format(new Date(session.date + 'T00:00:00'), 'MMMM yyyy');
      if (month !== currentMonth) {
        currentMonth = month;
        groups.push({ month, items: [] });
      }
      groups[groups.length - 1].items.push(session);
    }
    return groups;
  }, [sessions]);

  return (
    <div className="flex flex-col min-h-full bg-surface-base">
      <Header title="History" />

      {isLoading ? (
        <SkeletonList count={5} />
      ) : (sessions?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Calendar size={48} />}
          title="No workouts yet"
          description="Your completed sessions will appear here."
          action={{ label: 'Start a Workout', onClick: () => navigate('/') }}
        />
      ) : (
        <div className="flex flex-col gap-1 pb-8">
          {groupedSessions.map(({ month, items }) => (
            <div key={month}>
              <div className="sticky top-14 z-10 px-4 py-2 bg-glass">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {month}
                </span>
              </div>

              <div className="flex flex-col gap-2 px-4 pb-2">
                {items.map((session) => {
                  const colors = sessionMuscleColors.get(session.id) ?? [];
                  const exerciseNames = sessionExerciseNames.get(session.id) ?? [];
                  const mgIds = (sessionMgIds.get(session.id) ?? []).slice(0, 4);
                  const seCount = allSessionExercises?.filter((se) => se.sessionId === session.id).length ?? 0;

                  if (seCount === 0) return null;

                  return (
                    <button
                      key={session.id}
                      onClick={() => navigate(`/session/${session.id}`)}
                      className="flex items-center gap-3 bg-surface-card rounded-2xl px-4 py-3.5 border border-border/50 active:scale-[0.98] transition-all duration-fast text-left w-full shadow-card"
                    >
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {colors.length > 0 ? (
                          colors.slice(0, 4).map((color, i) => (
                            <span key={i} className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                          ))
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-text-muted/30" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-text-primary block">
                          {format(new Date(session.date + 'T00:00:00'), 'EEE, MMM d')}
                        </span>

                        {mgIds.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {mgIds.map((mgId) => {
                              const mg = mgMap.get(mgId);
                              return mg ? (
                                <Badge key={mgId} color={mg.color} className="text-[10px]">
                                  {mg.name}
                                </Badge>
                              ) : null;
                            })}
                          </div>
                        )}

                        {exerciseNames.length > 0 && (
                          <p className="text-xs text-text-secondary truncate mt-1">
                            {exerciseNames.slice(0, 4).join(' · ')}
                            {exerciseNames.length > 4 && (
                              <span className="text-text-muted"> +{exerciseNames.length - 4}</span>
                            )}
                          </p>
                        )}
                      </div>

                      <ChevronRight size={15} strokeWidth={2} className="text-text-muted flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
