import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { format, subDays } from 'date-fns';
import { Header } from '@/components/layout/Header';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { useDebounce } from '@/lib/useDebounce';
import { Search, Trophy, TrendingUp, Calendar, Activity } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { clsx } from 'clsx';
import {
  getPeriodConfig, calculatePeriodVolume, getWeeklyBreakdown,
  getMuscleDistribution, type PeriodType,
} from '@/lib/analyticsCalculators';
import { useAuthStore } from '@/stores/authStore';
import {
  getSessions, getMuscleGroups, getExercises,
  getAnalyticsData, getSessionExercisesInRange,
  getSessionIdsWithExercises,
  getPersonalRecords, getExerciseChartData,
} from '@/lib/api';

type Tab = 'overview' | 'exercise' | 'records';

const CC = { primary: '#4F7FFA', grid: 'var(--chart-grid)', text: 'var(--chart-text)', bg: 'transparent' };
const tooltipStyle = {
  backgroundColor: 'var(--color-surface-overlay)',
  border: '1px solid var(--color-border)',
  borderRadius: '12px',
  color: 'var(--color-text-primary)',
  fontSize: 12,
  padding: '8px 12px',
};

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const tabConfig: { value: Tab; label: string; icon: typeof TrendingUp }[] = [
    { value: 'overview', label: 'Overview', icon: Activity },
    { value: 'exercise', label: 'Exercise', icon: TrendingUp },
    { value: 'records',  label: 'Records',  icon: Trophy },
  ];

  return (
    <div className="flex flex-col min-h-full bg-surface-base">
      <Header title="Analytics" />
      <div className="flex bg-surface-card border-b border-border/50 px-4 gap-1 pt-1">
        {tabConfig.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setActiveTab(value)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold rounded-t-xl transition-all duration-fast border-b-2',
              activeTab === value ? 'text-accent border-accent' : 'text-text-secondary border-transparent',
            )}
          >
            <Icon size={14} strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'exercise' && <ExerciseTab />}
        {activeTab === 'records'  && <RecordsTab />}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface-card rounded-2xl p-4 border border-border/40 shadow-card flex flex-col gap-1">
      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-bold text-text-primary font-mono">{value}</span>
      {sub && <span className="text-xs text-text-secondary">{sub}</span>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-card rounded-2xl p-4 border border-border/40 shadow-card">
      <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

function OverviewTab() {
  const { user } = useAuthStore();
  const [periodType, setPeriodType] = useState<PeriodType>('3months');
  const [musclePeriodType, setMusclePeriodType] = useState<PeriodType>('month');

  // Derive date strings for query keys (stable between renders for same period)
  const { pStart, pEnd } = useMemo(() => {
    const cfg = getPeriodConfig(periodType);
    return { pStart: format(cfg.startDate, 'yyyy-MM-dd'), pEnd: format(cfg.endDate, 'yyyy-MM-dd') };
  }, [periodType]);

  const { mgStart, mgEnd } = useMemo(() => {
    const cfg = getPeriodConfig(musclePeriodType);
    return { mgStart: format(cfg.startDate, 'yyyy-MM-dd'), mgEnd: format(cfg.endDate, 'yyyy-MM-dd') };
  }, [musclePeriodType]);

  const { data: sessions } = useQuery({ queryKey: ['sessions', user?.id], queryFn: () => getSessions(user!.id), enabled: !!user });
  const { data: muscleGroups } = useQuery({ queryKey: ['muscleGroups', user?.id], queryFn: () => getMuscleGroups(user!.id), enabled: !!user, staleTime: Infinity });
  const { data: allExercises } = useQuery({ queryKey: ['exercises', user?.id], queryFn: () => getExercises(user!.id), enabled: !!user, staleTime: Infinity });

  // Lightweight query: which sessions have at least one exercise (for accurate counts)
  const { data: activeSessionIds } = useQuery({
    queryKey: ['activeSessionIds', user?.id],
    queryFn: () => getSessionIdsWithExercises(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // SEs + sets scoped to selected period — re-fetches only when period changes
  const { data: analyticsData } = useQuery({
    queryKey: ['analyticsData', user?.id, pStart, pEnd],
    queryFn: () => getAnalyticsData(user!.id, pStart, pEnd),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // SEs scoped to muscle period (sets not needed for distribution)
  const { data: muscleSEs } = useQuery({
    queryKey: ['analyticsSEs', user?.id, mgStart, mgEnd],
    queryFn: () => getSessionExercisesInRange(user!.id, mgStart, mgEnd),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const mgMap = useMemo(() => new Map(muscleGroups?.map((mg) => [mg.id, mg]) ?? []), [muscleGroups]);
  const periodConfig = getPeriodConfig(periodType);

  const weeklyData = useMemo(() => {
    if (!sessions || !analyticsData || !allExercises) return [];
    return getWeeklyBreakdown(sessions, analyticsData.sessionExercises, analyticsData.sets, allExercises, periodType, activeSessionIds);
  }, [sessions, analyticsData, allExercises, periodType, activeSessionIds]);

  const totalVolume = useMemo(() => {
    if (!sessions || !analyticsData || !allExercises) return 0;
    return calculatePeriodVolume(sessions, analyticsData.sessionExercises, analyticsData.sets, allExercises, periodType);
  }, [sessions, analyticsData, allExercises, periodType]);

  const heatmapData = useMemo(() => {
    if (!sessions) return [];
    const sessionSet = new Set(sessions.map((s) => s.date));
    const now = new Date();
    return Array.from({ length: 84 }, (_, i) => {
      const d = subDays(now, 83 - i);
      const dateStr = format(d, 'yyyy-MM-dd');
      return { date: dateStr, active: sessionSet.has(dateStr) };
    });
  }, [sessions]);

  const muscleDistribution = useMemo(() => {
    if (!sessions || !muscleSEs || !allExercises || !muscleGroups) return [];
    return getMuscleDistribution(sessions, muscleSEs, allExercises, mgMap, musclePeriodType);
  }, [sessions, muscleSEs, allExercises, muscleGroups, mgMap, musclePeriodType]);

  const thisWeek = weeklyData[weeklyData.length - 1];
  const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  const activeSessions = useMemo(
    () => (sessions ?? []).filter((s) => !activeSessionIds || activeSessionIds.has(s.id)),
    [sessions, activeSessionIds],
  );

  if (!sessions) return <SkeletonList count={3} />;

  const periodButtons: { value: PeriodType; label: string }[] = [
    { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' },
    { value: '3months', label: '3m' }, { value: 'year', label: 'Year' }, { value: 'alltime', label: 'All' },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Total" value={activeSessions.length} sub="sessions" />
        <StatCard label="This week" value={thisWeek?.sessions ?? 0} sub="sessions" />
        <StatCard label="30 days" value={activeSessions.filter((s) => s.date >= thirtyDaysAgo).length} sub="sessions" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-1.5">
          {periodButtons.map(({ value, label }) => (
            <button key={value} onClick={() => setPeriodType(value)} className={clsx('flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all duration-fast', periodType === value ? 'bg-accent text-white shadow-accent-glow' : 'bg-surface-card text-text-secondary border border-border/60 active:bg-surface-raised')}>
              {label}
            </button>
          ))}
        </div>
        <StatCard label={periodConfig.label} value={totalVolume.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} sub="kg" />
      </div>

      <ChartCard title={`Volume Breakdown (${periodConfig.label})`}>
        {weeklyData.every((d) => d.volume === 0) ? (
          <p className="text-sm text-text-secondary text-center py-6">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weeklyData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeOpacity={0.5} />
              <XAxis dataKey="week" tick={{ fill: CC.text, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CC.text, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(79,127,250,0.06)' }} />
              <Bar dataKey="volume" fill={CC.primary} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Training Frequency (12 weeks)">
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
          {Array.from({ length: 12 }, (_, week) => (
            <div key={week} className="flex flex-col gap-1">
              {heatmapData.slice(week * 7, week * 7 + 7).map((day, i) => (
                <div key={i} className="aspect-square rounded-sm transition-colors" style={{ backgroundColor: day.active ? CC.primary : 'var(--color-surface-raised)' }} title={day.date} />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 mt-3">
          <span className="text-[10px] text-text-muted">Less</span>
          {[0.15, 0.35, 0.6, 0.85, 1].map((op, i) => (
            <div key={i} className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CC.primary, opacity: op }} />
          ))}
          <span className="text-[10px] text-text-muted">More</span>
        </div>
      </ChartCard>

      {muscleDistribution.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5">
            {periodButtons.map(({ value, label }) => (
              <button key={value} onClick={() => setMusclePeriodType(value)} className={clsx('flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all duration-fast', musclePeriodType === value ? 'bg-accent text-white shadow-accent-glow' : 'bg-surface-card text-text-secondary border border-border/60 active:bg-surface-raised')}>
                {label}
              </button>
            ))}
          </div>
          <ChartCard title={`Muscle Focus (${getPeriodConfig(musclePeriodType).label})`}>
            <div className="flex flex-col gap-3">
              {muscleDistribution.slice(0, 6).map(({ mg, count }) => {
                const max = muscleDistribution[0].count;
                return (
                  <div key={mg.id} className="flex items-center gap-3">
                    <Badge color={mg.color} className="text-[10px] w-24 flex-shrink-0 justify-start">{mg.name}</Badge>
                    <div className="flex-1 h-1.5 bg-surface-raised rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-slow" style={{ width: `${(count / max) * 100}%`, backgroundColor: mg.color }} />
                    </div>
                    <span className="text-xs text-text-muted font-mono w-5 text-right flex-shrink-0">{count}</span>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

function ExerciseTab() {
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const { data: allExercises } = useQuery({
    queryKey: ['exercises', user?.id],
    queryFn: () => getExercises(user!.id),
    enabled: !!user,
    staleTime: Infinity,
  });

  const exercises = useMemo(() => {
    if (!allExercises) return [];
    if (!debouncedSearch) return allExercises;
    const q = debouncedSearch.toLowerCase();
    return allExercises.filter((e) => e.name.toLowerCase().includes(q));
  }, [allExercises, debouncedSearch]);

  const selectedExercise = useMemo(
    () => allExercises?.find((e) => e.id === selectedExerciseId),
    [allExercises, selectedExerciseId],
  );

  const { data: rawChartData, isLoading: chartLoading } = useQuery({
    queryKey: ['exerciseChartData', selectedExerciseId],
    queryFn: () => getExerciseChartData(selectedExerciseId!),
    enabled: !!selectedExerciseId,
  });

  const chartData = useMemo(() => {
    if (!rawChartData) return null;
    return rawChartData.map((d) => ({
      ...d,
      date: format(new Date(d.date + 'T00:00:00'), 'MMM d'),
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [rawChartData]);

  return (
    <div className="flex flex-col gap-4 p-4">
      {selectedExerciseId && (
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedExerciseId(null)} className="flex items-center gap-1.5 text-sm font-semibold text-accent active:opacity-70 transition-opacity">
            ← {selectedExercise?.name ?? 'Back'}
          </button>
        </div>
      )}

      {!selectedExerciseId && (
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="search"
            placeholder="Search exercises…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 bg-surface-card border border-border/60 rounded-2xl pl-10 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 transition-all duration-fast"
          />
        </div>
      )}

      {!selectedExerciseId && (
        <div className="bg-surface-card rounded-2xl border border-border/40 overflow-hidden shadow-card">
          {exercises.map((ex, idx) => (
            <button
              key={ex.id}
              onClick={() => { setSelectedExerciseId(ex.id); setSearch(''); }}
              className={clsx('flex items-center justify-between px-4 py-3.5 w-full text-left transition-colors duration-fast active:bg-surface-raised', idx < exercises.length - 1 && 'border-b border-border/40')}
            >
              <span className="text-sm text-text-primary">{ex.name}</span>
              <TrendingUp size={14} className="text-text-muted" strokeWidth={1.75} />
            </button>
          ))}
          {exercises.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-secondary">No exercises found</div>
          )}
        </div>
      )}

      {selectedExerciseId && (
        <>
          {chartLoading ? (
            <SkeletonList count={2} />
          ) : chartData && chartData.length > 0 ? (
            <>
              <LineChartCard title="Max Weight (kg)" data={chartData} dataKey="maxWeight" />
              <LineChartCard title="Session Volume (kg)" data={chartData} dataKey="volume" />
              <LineChartCard title="Est. 1RM (kg)" data={chartData} dataKey="e1rm" />
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Calendar size={36} className="text-text-muted" strokeWidth={1.5} />
              <p className="text-sm text-text-secondary">No data for this exercise yet.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LineChartCard({ title, data, dataKey }: { title: string; data: { date: string; [key: string]: string | number }[]; dataKey: string }) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeOpacity={0.5} />
          <XAxis dataKey="date" tick={{ fill: CC.text, fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: CC.text, fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey={dataKey} stroke={CC.primary} strokeWidth={2} dot={{ fill: CC.primary, r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function RecordsTab() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: records } = useQuery({
    queryKey: ['personalRecords', user?.id],
    queryFn: () => getPersonalRecords(user!.id),
    enabled: !!user,
  });

  const { data: allExercises } = useQuery({
    queryKey: ['exercises', user?.id],
    queryFn: () => getExercises(user!.id),
    enabled: !!user,
    staleTime: Infinity,
  });

  const exerciseMap = useMemo(() => new Map(allExercises?.map((e) => [e.id, e]) ?? []), [allExercises]);
  const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  const typeLabels: Record<string, string> = { max_weight: 'Max Weight', max_reps: 'Max Reps', max_volume: 'Max Volume', max_distance: 'Max Distance', max_duration: 'Max Duration' };
  const typeUnits: Record<string, string> = { max_weight: 'kg', max_reps: 'reps', max_volume: 'kg', max_distance: 'm', max_duration: 's' };
  const typeEmoji: Record<string, string> = { max_weight: '🏋️', max_reps: '🔁', max_volume: '📊', max_distance: '📏', max_duration: '⏱️' };

  if (!records) return <SkeletonList count={3} />;

  if (records.length === 0) {
    return (
      <EmptyState
        icon={<Trophy size={48} />}
        title="No records yet"
        description="Complete sets to set personal records."
        action={{ label: 'Go to Calendar', onClick: () => navigate('/') }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {records.map((pr) => {
        const exercise = exerciseMap.get(pr.exerciseId);
        const isRecent = pr.date >= thirtyDaysAgo;
        return (
          <div key={pr.id} className="bg-surface-card rounded-2xl px-4 py-4 border border-border/40 shadow-card flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-surface-raised flex items-center justify-center flex-shrink-0 text-lg">
              {typeEmoji[pr.type] ?? '🏆'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text-primary truncate">{exercise?.name ?? 'Unknown'}</span>
                {isRecent && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent/15 text-accent font-bold flex-shrink-0">NEW</span>}
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                {typeLabels[pr.type]} · {format(new Date(pr.date + 'T00:00:00'), 'MMM d, yyyy')}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xl font-bold text-accent font-mono">{pr.value}</div>
              <div className="text-[10px] text-text-muted">{typeUnits[pr.type]}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
