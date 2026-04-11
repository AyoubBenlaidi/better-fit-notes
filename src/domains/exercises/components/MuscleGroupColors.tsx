import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { MuscleGroup } from '@/types/entities';
import { clsx } from 'clsx';

const PRESET_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#84CC16', // Lime
  '#22C55E', // Green
  '#10B981', // Emerald
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
  '#0EA5E9', // Sky
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#A855F7', // Purple
  '#D946EF', // Fuchsia
  '#EC4899', // Pink
  '#64748B', // Slate
];

interface MuscleGroupColorsProps {
  isOpen: boolean;
  onClose: () => void;
  muscleGroups: MuscleGroup[];
  onColorChange: (mgId: string, color: string) => void;
  loading?: boolean;
}

export function MuscleGroupColors({
  isOpen,
  onClose,
  muscleGroups,
  onColorChange,
  loading,
}: MuscleGroupColorsProps) {
  const [selectedMgId, setSelectedMgId] = useState<string | null>(null);
  const [tempColor, setTempColor] = useState<string>('');

  const handleSelectMg = (mg: MuscleGroup) => {
    setSelectedMgId(mg.id);
    setTempColor(mg.color);
  };

  const handleApplyColor = (color: string) => {
    if (selectedMgId) {
      onColorChange(selectedMgId, color);
      setTempColor(color);
    }
  };

  const handleClose = () => {
    setSelectedMgId(null);
    setTempColor('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Category Colors">
      <div className="flex flex-col gap-4">
        {/* Muscle group list */}
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {muscleGroups.map((mg) => (
            <button
              key={mg.id}
              onClick={() => handleSelectMg(mg)}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-fast',
                selectedMgId === mg.id
                  ? 'bg-accent/10 border border-accent'
                  : 'bg-surface-raised border border-border/60 hover:bg-surface-overlay'
              )}
            >
              <div
                className="w-8 h-8 rounded-lg border-2 border-border flex-shrink-0"
                style={{ backgroundColor: mg.color }}
              />
              <span className="text-sm font-semibold text-text-primary flex-1 text-left">
                {mg.name}
              </span>
            </button>
          ))}
        </div>

        {/* Color picker */}
        {selectedMgId && (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-text-secondary mb-3 uppercase tracking-wide">
              Choose Color
            </p>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleApplyColor(color)}
                  className={clsx(
                    'h-10 rounded-lg border-2 transition-all duration-fast',
                    tempColor === color
                      ? 'border-accent shadow-accent-glow scale-110'
                      : 'border-border hover:border-accent/50'
                  )}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        )}

        {/* Custom color input */}
        {selectedMgId && (
          <div className="flex gap-2">
            <input
              type="text"
              value={tempColor}
              onChange={(e) => setTempColor(e.target.value)}
              placeholder="#000000"
              className={clsx(
                'flex-1 h-10 px-3 bg-surface-card border border-border/60 rounded-lg',
                'text-sm text-text-primary placeholder:text-text-muted',
                'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60',
                'transition-all duration-fast'
              )}
            />
            <button
              onClick={() => handleApplyColor(tempColor)}
              disabled={loading}
              className={clsx(
                'px-3 h-10 rounded-lg font-semibold text-sm',
                'bg-accent text-white active:bg-accent-pressed',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'transition-all duration-fast'
              )}
            >
              Update
            </button>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClose}
            className="flex-1"
          >
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
