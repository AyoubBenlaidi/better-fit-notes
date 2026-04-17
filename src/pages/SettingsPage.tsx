import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sun, Moon, Monitor, Download, Upload, Trash2, Info, LogOut, User2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { signOut } from '@/domains/auth/hooks/useAuth';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { clsx } from 'clsx';
import { parseCSV, validateCSV, importCSVData } from '@/lib/csvParser';
import { upsertSettings, getExercises, getSessions, getAllSessionExercises, getAllSets, getTemplates, getPersonalRecords, getMuscleGroups } from '@/lib/api';

export function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettingsStore();
  const { user, reset: resetAuth } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [importingCSV, setImportingCSV] = useState(false);

  const settingsMutation = useMutation({
    mutationFn: (partial: Partial<typeof settings>) => upsertSettings(user!.id, partial),
  });

  async function handleSettingChange<K extends keyof typeof settings>(key: K, value: typeof settings[K]) {
    updateSettings({ [key]: value });
    settingsMutation.mutate({ [key]: value });
  }

  async function handleExportJSON() {
    try {
      const [exercises, sessions, allSEs, allSets, templates, personalRecords, muscleGroups] = await Promise.all([
        getExercises(user!.id),
        getSessions(user!.id),
        getAllSessionExercises(user!.id),
        getAllSets(user!.id),
        getTemplates(user!.id),
        getPersonalRecords(user!.id),
        getMuscleGroups(user!.id),
      ]);
      const blob = new Blob([JSON.stringify({ exercises, sessions, sessionExercises: allSEs, sets: allSets, templates, personalRecords, muscleGroups }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bfn-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Data exported', 'success');
    } catch {
      toast('Export failed', 'error');
    }
  }

  async function handleExportCSV() {
    try {
      const [sessions, allSEs, allSets, exercises] = await Promise.all([
        getSessions(user!.id),
        getAllSessionExercises(user!.id),
        getAllSets(user!.id),
        getExercises(user!.id),
      ]);
      const exMap = new Map(exercises.map((e) => [e.id, e]));
      const seMap = new Map(allSEs.map((se) => [se.id, se]));
      const sessionMap = new Map(sessions.map((s) => [s.id, s]));
      const rows = [['date', 'exercise', 'set', 'weight_kg', 'reps', 'duration_s', 'distance_m', 'rpe', 'warmup']];
      for (const set of allSets) {
        const se = seMap.get(set.sessionExerciseId);
        if (!se) continue;
        const session = sessionMap.get(se.sessionId);
        if (!session) continue;
        const ex = exMap.get(se.exerciseId);
        rows.push([session.date, ex?.name ?? '', String(set.order), String(set.weight ?? ''), String(set.reps ?? ''), String(set.duration ?? ''), String(set.distance ?? ''), String(set.rpe ?? ''), set.isWarmup ? 'true' : 'false']);
      }
      const csv = rows.map((r) => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bfn-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast('CSV exported', 'success');
    } catch {
      toast('Export failed', 'error');
    }
  }

  async function handleImportCSV() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        setImportingCSV(true);
        const text = await file.text();
        const rows = parseCSV(text);

        if (rows.length === 0) {
          toast('No valid rows found in CSV', 'error');
          return;
        }

        const validation = await validateCSV(rows, user!.id);

        if (validation.missingExercises.length > 0 || validation.unmappedCategories.size > 0) {
          const missingText = validation.missingExercises.length > 0
            ? `${validation.missingExercises.length} exercises will be created.\n` : '';
          const unmappedText = validation.unmappedCategories.size > 0
            ? `Category mapping not found for: ${Array.from(validation.unmappedCategories).join(', ')}\n` : '';
          const message = `Found ${validation.uniqueExercises.size} unique exercises from ${validation.totalRows} sets.\n${missingText}${unmappedText}Period: ${validation.dateRange.start} to ${validation.dateRange.end}\n\nContinue import?`;
          if (!confirm(message)) return;
        }

        const result = await importCSVData(rows, user!.id);

        // Refresh all cached data
        queryClient.invalidateQueries({ queryKey: ['sessions', user?.id] });
        queryClient.invalidateQueries({ queryKey: ['allSessionExercises', user?.id] });
        queryClient.invalidateQueries({ queryKey: ['allSets', user?.id] });
        queryClient.invalidateQueries({ queryKey: ['exercises', user?.id] });

        let message = `Imported ${result.sessionsCreated} sessions and ${result.setsCreated} sets`;
        if (result.exercisesCreated > 0) message += ` (${result.exercisesCreated} new exercises created)`;
        if (result.errors.length > 0) message += `\n⚠️ ${result.errors.length} errors occurred`;
        toast(message, result.errors.length > 0 ? 'info' : 'success');
      } catch (error) {
        toast(`Import failed: ${error}`, 'error');
      } finally {
        setImportingCSV(false);
      }
    };
    input.click();
  }

  async function handleClearData() {
    if (!confirm('This will permanently delete ALL your workout data. Are you sure?')) return;

    if (isSupabaseConfigured && user) {
      const tables = ['personal_records', 'sets', 'template_exercises', 'session_exercises', 'sessions', 'templates'];
      for (const table of tables) {
        const { error } = await supabase!.from(table).delete().eq('user_id', user.id);
        if (error) console.error(`[ClearData] Failed to delete ${table}`, error);
      }
    }

    // Clear React Query cache for all data keys
    queryClient.removeQueries({ queryKey: ['sessions'] });
    queryClient.removeQueries({ queryKey: ['allSessionExercises'] });
    queryClient.removeQueries({ queryKey: ['allSets'] });
    queryClient.removeQueries({ queryKey: ['personalRecords'] });

    toast('All data cleared', 'success');
  }

  async function handleSignOut() {
    resetAuth();
    useSessionStore.getState().reset();
    resetSettings();
    
    queryClient.clear();
    
    await signOut();
    
    toast('Signed out', 'info');
    navigate('/auth', { replace: true });
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-base">
      <Header title="Settings" />

      <div className="flex flex-col gap-2 px-4 pt-4 pb-10">

        <Section title="Units">
          <SegmentControl
            label="Weight Unit"
            options={[{ value: 'kg', label: 'kg' }, { value: 'lbs', label: 'lbs' }]}
            value={settings.weightUnit}
            onChange={(v) => handleSettingChange('weightUnit', v as 'kg' | 'lbs')}
          />
          <div className="h-px bg-border/40 -mx-1" />
          <SegmentControl
            label="Date Format"
            options={[{ value: 'DD/MM/YYYY', label: 'DD/MM' }, { value: 'MM/DD/YYYY', label: 'MM/DD' }]}
            value={settings.dateFormat}
            onChange={(v) => handleSettingChange('dateFormat', v as 'DD/MM/YYYY' | 'MM/DD/YYYY')}
          />
          <div className="h-px bg-border/40 -mx-1" />
          <SegmentControl
            label="Week starts on"
            options={[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]}
            value={String(settings.firstDayOfWeek)}
            onChange={(v) => handleSettingChange('firstDayOfWeek', Number(v) as 0 | 1)}
          />
        </Section>

        <Section title="Appearance">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-text-secondary">Theme</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'dark', icon: Moon, label: 'Dark' },
                { value: 'light', icon: Sun, label: 'Light' },
                { value: 'system', icon: Monitor, label: 'System' },
              ].map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => handleSettingChange('theme', value as 'dark' | 'light' | 'system')}
                  className={clsx(
                    'flex flex-col items-center gap-2 py-3.5 rounded-2xl border text-xs font-semibold transition-all duration-fast active:scale-95',
                    settings.theme === value
                      ? 'bg-accent/15 border-accent/50 text-accent'
                      : 'bg-surface-raised border-border/50 text-text-secondary',
                  )}
                >
                  <Icon size={19} strokeWidth={1.75} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Data">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={handleExportJSON} className="rounded-xl h-11">
                <Download size={14} />Export JSON
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExportCSV} className="rounded-xl h-11">
                <Download size={14} />Export CSV
              </Button>
            </div>
            <Button variant="secondary" fullWidth onClick={handleImportCSV} disabled={importingCSV}>
              <Upload size={15} />
              {importingCSV ? 'Importing FitNotes CSV...' : 'Import FitNotes CSV'}
            </Button>
            <div className="h-px bg-border/40" />
            <Button variant="danger" fullWidth onClick={handleClearData}>
              <Trash2 size={15} />Clear all data
            </Button>
          </div>
        </Section>

        {isSupabaseConfigured && (
          <Section title="Account">
            {user ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                    <User2 size={16} className="text-accent" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{user.email}</p>
                    <p className="text-xs text-text-secondary">Cloud sync active</p>
                  </div>
                </div>
                <Button variant="secondary" fullWidth onClick={handleSignOut}>
                  <LogOut size={15} />Sign Out
                </Button>
              </div>
            ) : (
              <p className="text-sm text-text-secondary leading-relaxed">
                Sign in to enable cloud backup and sync across devices.
              </p>
            )}
          </Section>
        )}

        <Section title="About">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-accent flex items-center justify-center flex-shrink-0 shadow-accent-glow">
              <Info size={16} className="text-white" strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Better Fit Notes</p>
              <p className="text-xs text-text-secondary font-mono">v2.0.0 · Cloud-first</p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-[11px] font-bold text-text-muted uppercase tracking-widest px-1 pt-2">{title}</h2>
      <div className="bg-surface-card rounded-2xl px-4 py-4 flex flex-col gap-4 border border-border/40 shadow-card">
        {children}
      </div>
    </div>
  );
}

function SegmentControl({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-text-primary font-medium flex-shrink-0">{label}</span>
      <div className="flex gap-0.5 bg-surface-raised rounded-xl p-0.5 flex-shrink-0">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={clsx(
              'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-fast',
              value === opt.value ? 'bg-accent text-white shadow-sm' : 'text-text-secondary active:bg-surface-overlay',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
