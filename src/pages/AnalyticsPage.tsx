import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { format, subDays } from 'date-fns';
import { db } from '@/db/schema';
import { Header } from '@/components/layout/Header';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { useDebounce } from '@/lib/useDebounce';
import { Search, Trophy, TrendingUp, Calendar, Activity } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { clsx } from 'clsx';
import { getPeriodConfig, calculatePeriodVolume, getWeeklyBreakdown, getMuscleDistribution, type PeriodType } from '@/lib/analyticsCalculators';

type Tab = 'overview' | 'exercise' | 'records';

// CSS var-based chart colors (works for both themes)
const CC = {
  primary: '#4F7FFA',
  grid:    'var(--chart-grid)',
  text:    'var(--chart-text)',
  bg:      'transparent',
};

// Custom tooltip style
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

      {/* Tab bar */}
      <div className="flex bg-surface-card border-b border-border/50 px-4 gap-1 pt-1">
        {tabConfig.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setActiveTab(value)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold rounded-t-xl transition-all duration-fast',
              'border-b-2',
              activeTab === value
                ? 'text-accent border-accent'
                : 'text-text-secondary border-transparent',
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

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface-card rounded-2xl p-4 border border-border/40 shadow-card flex flex-col gap-1">
      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-bold text-text-primary font-mono">{value}</span>
      {sub && <span className="text-xs text-text-secondary">{sub}</span>}
    </div>
  );
}

// ─── Chart Card ──────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-card rounded-2xl p-4 border border-border/40 shadow-card">
      <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const [periodType, setPeriodType] = useState<PeriodType>('3months');
  const [musclePeriodType, setMusclePeriodType] = useState<PeriodType>('month');

  const sessions = useLiveQuery(() => db.sessions.orderBy('date').toArray(), []);
  const muscleGroups = useLiveQuery(() => db.muscleGroups.toArray(), []);
  const allSessionExercises = useLiveQuery(() => db.sessionExercises.toArray(), []);
  const allExercises = useLiveQuery(() => db.exercises.toArray(), []);
  const allSets = useLiveQuery(() => db.sets.toArray(), []);

  const mgMap = useMemo(() => new Map(muscleGroups?.map((mg) => [mg.id, mg]) ?? []), [muscleGroups]);

  const periodConfig = getPeriodConfig(periodType);

  const weeklyData = useMemo(() => {
    if (!sessions || !allSets || !allSessionExercises || !allExercises) return [];
    return getWeeklyBreakdown(sessions, allSessionExercises, allSets, allExercises, periodType);
  }, [sessions, allSets, allSessionExercises, allExercises, periodType]);

  const totalVolume = useMemo(() => {
    if (!sessions || !allSets || !allSessionExercises || !allExercises) return 0;
    return calculatePeriodVolume(sessions, allSessionExercises, allSets, allExercises, periodType);
  }, [sessions, allSets, allSessionExercises, allExercises, periodType]);

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
    if (!sessions || !allSessionExercises || !allExercises || !muscleGroups) return [];
    return getMuscleDistribution(sessions, allSessionExercises, allExercises, mgMap, musclePeriodType);
  }, [sessions, allSessionExercises, allExercises, muscleGroups, mgMap, musclePeriodType]);

  const thisWeek = weeklyData[weeklyData.length - 1];
  const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  if (!sessions) return <SkeletonList count={3} />;

  const periodButtons: { value: PeriodType; label: string }[] = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: '3months', label: '3m' },
    { value: 'year', label: 'Year' },
    { value: 'alltime', label: 'All' },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Total" value={sessions.length} sub="sessions" />
        <StatCard label="This week" value={thisWeek?.sessions ?? 0} sub="sessions" />
        <StatCard label="30 days" value={sessions.filter((s) => s.date >= thirtyDaysAgo).length} sub="sessions" />
      </div>

      {/* Period selector + volume stat */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-1.5">
          {periodButtons.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPeriodType(value)}
              className={clsx(
                'flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all duration-fast',
                periodType === value
                  ? 'bg-accent text-white shadow-accent-glow'
                  : 'bg-surface-card text-text-secondary border border-border/60 active:bg-surface-raised'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <StatCard
          label={periodConfig.label}
          value={totalVolume.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
          sub="kg"
        />
      </div>

      {/* Weekly volume chart */}
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

      {/* Training heatmap */}
      <ChartCard title="Training Frequency (12 weeks)">
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
          {Array.from({ length: 12 }, (_, week) => (
            <div key={week} className="flex flex-col gap-1">
              {heatmapData.slice(week * 7, week * 7 + 7).map((day, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-sm transition-colors"
                  style={{ backgroundColor: day.active ? CC.primary : 'var(--color-surface-raised)' }}
                  title={day.date}
                />
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

      {/* Muscle distribution */}
      {muscleDistribution.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5">
            {periodButtons.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setMusclePeriodType(value)}
                className={clsx(
                  'flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all duration-fast',
                  musclePeriodType === value
                    ? 'bg-accent text-white shadow-accent-glow'
                    : 'bg-surface-card text-text-secondary border border-border/60 active:bg-surface-raised'
                )}
              >
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
                    <Badge color={mg.color} className="text-[10px] w-24 flex-shrink-0 justify-start">
                      {mg.name}
                    </Badge>
                    <div className="flex-1 h-1.5 bg-surface-raised rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-slow"
                        style={{ width: `${(count / max) * 100}%`, backgroundColor: mg.color }}
                      />
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

// ─── Exercise Tab ─────────────────────────────────────────────────────────────

function ExerciseTab() {
  const [search, setSearch] = useState('');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  const exercises = useLiveQuery(
    async () => {
      if (!debouncedSearch) return db.exercises.orderBy('name').toArray();
      const q = debouncedSearch.toLowerCase();
      return db.exercises.filter((e) => e.name.toLowerCase().includes(q)).toArray();
    },
    [debouncedSearch],
  );

  const selectedExercise = useLiveQuery(
    () => selectedExerciseId ? db.exercises.get(selectedExerciseId) : undefined,
    [selectedExerciseId],
  );

  const chartData = useLiveQuery(async () => {
    if (!selectedExerciseId) return null;
    const ses = await db.sessionExercises.where('exerciseId').equals(selectedExerciseId).toArray();
    const results = [];
    for (const se of ses) {
      const session = await db.sessions.get(se.sessionId);
      if (!session) continue;
      const sets = await db.sets.where('sessionExerciseId').equals(se.id).toArray();
      const completedSets = sets.filter((s) => s.completedAt);
      if (completedSets.length === 0) continue;
      const topSet = completedSets.reduce((best, s) => (s.weight ?? 0) > (best.weight ?? 0) ? s : best, completedSets[0]);
      const e1rm = topSet?.weight && topSet?.reps
        ? Math.round(topSet.weight / (1.0278 - 0.0278 * topSet.reps))
        : 0;
      results.push({
        date: format(new Date(session.date + 'T00:00:00'), 'MMM d'),
        maxWeight: Math.max(...completedSets.map((s) => s.weight ?? 0)),
        volume: Math.round(completedSets.reduce((acc, s) => acc + (s.weight ?? 0) * (s.reps ?? 0), 0)),
        e1rm,
      });
    }
    return results.sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedExerciseId]);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Back when exercise selected */}
      {selectedExerciseId && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedExerciseId(null)}
            className="flex items-center gap-1.5 text-sm font-semibold text-accent active:opacity-70 transition-opacity"
          >
            ← {selectedExercise?.name ?? 'Back'}
          </button>
        </div>
      )}

      {/* Search */}
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

      {/* Exercise list */}
      {!selectedExerciseId && (
        <div className="bg-surface-card rounded-2xl border border-border/40 overflow-hidden shadow-card">
          {exercises?.map((ex, idx) => (
            <button
              key={ex.id}
              onClick={() => { setSelectedExerciseId(ex.id); setSearch(''); }}
              className={clsx(
                'flex items-center justify-between px-4 py-3.5 w-full text-left transition-colors duration-fast active:bg-surface-raised',
                idx < (exercises.length - 1) && 'border-b border-border/40',
              )}
            >
              <span className="text-sm text-text-primary">{ex.name}</span>
              <TrendingUp size={14} className="text-text-muted" strokeWidth={1.75} />
            </button>
          ))}
          {exercises?.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-secondary">
              No exercises found
            </div>
          )}
        </div>
      )}

      {/* Charts */}
      {selectedExerciseId && (
        <>
          {chartData === undefined ? (
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
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={CC.primary}
            strokeWidth={2}
            dot={{ fill: CC.primary, r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Records Tab ──────────────────────────────────────────────────────────────

function RecordsTab() {
  const navigate = useNavigate();
  const records = useLiveQuery(() => db.personalRecords.orderBy('date').reverse().toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const exerciseMap = useMemo(() => new Map(exercises?.map((e) => [e.id, e]) ?? []), [exercises]);

  const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  const typeLabels: Record<string, string> = {
    max_weight:   'Max Weight',
    max_reps:     'Max Reps',
    max_volume:   'Max Volume',
    max_distance: 'Max Distance',
    max_duration: 'Max Duration',
  };
  const typeUnits: Record<string, string> = {
    max_weight:   'kg',
    max_reps:     'reps',
    max_volume:   'kg',
    max_distance: 'm',
    max_duration: 's',
  };
  const typeEmoji: Record<string, string> = {
    max_weight:   '🏋️',
    max_reps:     '🔁',
    max_volume:   '📊',
    max_distance: '📏',
    max_duration: '⏱️',
  };

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
          <div
            key={pr.id}
            className="bg-surface-card rounded-2xl px-4 py-4 border border-border/40 shadow-card flex items-center gap-3"
          >
            <div className="h-10 w-10 rounded-2xl bg-surface-raised flex items-center justify-center flex-shrink-0 text-lg">
              {typeEmoji[pr.type] ?? '🏆'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text-primary truncate">
                  {exercise?.name ?? 'Unknown'}
                </span>
                {isRecent && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent/15 text-accent font-bold flex-shrink-0">
                    NEW
                  </span>
                )}
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
