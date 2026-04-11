import { useState, useRef, useCallback } from 'react';

export interface TouchDragState {
  draggedId: string | null;
  dragOverId: string | null;
  isDragging: boolean;
}

/**
 * Touch drag-and-drop via document-level listeners + elementFromPoint.
 * Attach handleGripTouchStart to the drag handle only — the rest is managed
 * at document level so scroll is never blocked outside of an active drag.
 */
export function useTouchDragDrop(onDrop: (sourceId: string, targetId: string) => void) {
  const [state, setState] = useState<TouchDragState>({
    draggedId: null,
    dragOverId: null,
    isDragging: false,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  // Guard: only one drag at a time
  const activeRef = useRef(false);

  const reset = useCallback(() => {
    activeRef.current = false;
    setState({ draggedId: null, dragOverId: null, isDragging: false });
  }, []);

  const handleGripTouchStart = useCallback(
    (e: React.TouchEvent, id: string) => {
      if (activeRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;

      activeRef.current = true;
      const startY = touch.clientY;
      let dragging = false;

      setState({ draggedId: id, dragOverId: null, isDragging: false });

      function onMove(ev: TouchEvent) {
        const t = ev.touches[0];
        if (!t) return;

        if (!dragging) {
          if (Math.abs(t.clientY - startY) < 8) return;
          dragging = true;
          setState((prev) => ({ ...prev, isDragging: true }));
        }

        // Suppress scroll only while actively dragging
        ev.preventDefault();

        // Detect which ExerciseBlock is under the finger via data-se-id
        const els = document.elementsFromPoint(t.clientX, t.clientY);
        const target = els.find(
          (el): el is HTMLElement =>
            el instanceof HTMLElement && el.dataset.seId !== undefined,
        );
        const hoveredId = target?.dataset.seId ?? null;
        setState((prev) => ({ ...prev, dragOverId: hoveredId }));
      }

      function onEnd() {
        document.removeEventListener('touchmove', onMove);
        const { draggedId, dragOverId } = stateRef.current;
        if (dragging && draggedId && dragOverId && draggedId !== dragOverId) {
          onDropRef.current(draggedId, dragOverId);
        }
        reset();
      }

      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd, { once: true });
    },
    [reset],
  );

  return { state, handleGripTouchStart };
}
