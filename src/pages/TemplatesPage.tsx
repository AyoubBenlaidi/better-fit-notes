import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Trash2, LayoutTemplate } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/components/ui/Toast';
import { format } from 'date-fns';
import {
  getTemplates, createTemplate, deleteTemplate,
  getTemplateExercises, createSession, createSessionExercise, createSet,
} from '@/lib/api';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function TemplatesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: () => getTemplates(user!.id),
    enabled: !!user,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data: FormValues) => createTemplate(user!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', user?.id] });
      setCreateOpen(false);
      reset();
      toast('Template created', 'success');
    },
    onError: (err) => toast((err as Error).message, 'error'),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', user?.id] });
      toast('Template deleted', 'success');
    },
    onError: (err) => toast((err as Error).message, 'error'),
  });

  const launchTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const session = await createSession(user!.id, {
        id: crypto.randomUUID(), date: today, templateId, startedAt: new Date(),
      });

      const templateExercises = await getTemplateExercises(templateId);

      for (const te of templateExercises) {
        const se = await createSessionExercise(user!.id, {
          id: crypto.randomUUID(), sessionId: session.id, exerciseId: te.exerciseId, order: te.order,
        });

        for (let i = 0; i < te.defaultSets; i++) {
          await createSet(user!.id, {
            id: crypto.randomUUID(), sessionExerciseId: se.id,
            order: i + 1, reps: te.defaultReps, weight: te.defaultWeight, isWarmup: false,
          });
        }
      }

      return session;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', user?.id] });
      navigate(`/session/${session.id}`);
    },
    onError: (err) => toast((err as Error).message, 'error'),
  });

  return (
    <div className="flex flex-col min-h-full bg-surface-base">
      <Header
        title="Templates"
        right={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            New
          </Button>
        }
      />

      {isLoading ? (
        <SkeletonList count={3} />
      ) : (templates?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<LayoutTemplate size={48} />}
          title="No templates yet"
          description="Create a template to quickly start a pre-planned workout."
          action={{ label: 'Create Template', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 p-4">
          {(templates ?? []).map((template) => (
            <div
              key={template.id}
              className="bg-surface-card rounded-2xl p-4 flex items-center gap-3 border border-border/40 shadow-card"
            >
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-text-primary truncate">{template.name}</h3>
                {template.description && (
                  <p className="text-xs text-text-secondary mt-0.5 truncate">{template.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => deleteTemplateMutation.mutate(template.id)}
                  className="p-1 h-8 w-8 text-danger"
                >
                  <Trash2 size={14} />
                </Button>
                <Button
                  size="sm"
                  onClick={() => launchTemplate.mutate(template.id)}
                  loading={launchTemplate.isPending}
                >
                  <Play size={14} />
                  Start
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={createOpen}
        onClose={() => { setCreateOpen(false); reset(); }}
        title="New Template"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => { setCreateOpen(false); reset(); }}>Cancel</Button>
            <Button fullWidth loading={createTemplateMutation.isPending} onClick={handleSubmit((d) => createTemplateMutation.mutate(d))}>Create</Button>
          </div>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={handleSubmit((d) => createTemplateMutation.mutate(d))}>
          <Input label="Template Name" placeholder="e.g. Push Day A" error={errors.name?.message} {...register('name')} />
          <Input label="Description (optional)" placeholder="e.g. Chest + Shoulders + Triceps" {...register('description')} />
        </form>
      </Modal>
    </div>
  );
}
