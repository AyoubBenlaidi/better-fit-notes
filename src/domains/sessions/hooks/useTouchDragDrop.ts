import { useState, useRef, useCallback } from 'react';

export interface TouchDragDropState {
  draggedId: string | null;
  dragOverId: string | null;
  offsetY: number;
  isDragging: boolean;
}

export function useTouchDragDrop() {
  const [state, setState] = useState<TouchDragDropState>({
    draggedId: null,
    dragOverId: null,
    offsetY: 0,
    isDragging: false,
  });
  
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const draggedElementRef = useRef<HTMLElement | null>(null);
  const isDraggingRef = useRef(false);
  const startTimeRef = useRef<number>(0);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>, id: string) => {
    const touch = e.touches[0];
    if (!touch) return;
    
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    startTimeRef.current = Date.now();
    isDraggingRef.current = false;
    setState((prev) => ({ ...prev, draggedId: id, isDragging: false }));
    draggedElementRef.current = e.currentTarget;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>, id: string) => {
    if (!touchStartPosRef.current) return;

    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartPosRef.current.x;
    const deltaY = touch.clientY - touchStartPosRef.current.y;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // Start dragging if moved more than 12px vertically (ignore small movements)
    // and vertical movement is greater than horizontal (to avoid interfering with horizontal scroll)
    if (!isDraggingRef.current && absDeltaY > 12 && absDeltaY > absDeltaX) {
      isDraggingRef.current = true;
      setState((prev) => ({ ...prev, isDragging: true }));
      
      // Prevent default to stop scrolling
      e.preventDefault();
      
      // Add visual feedback
      if (draggedElementRef.current) {
        draggedElementRef.current.style.opacity = '0.6';
        draggedElementRef.current.style.pointerEvents = 'none';
        draggedElementRef.current.style.zIndex = '50';
      }
    }

    if (isDraggingRef.current) {
      e.preventDefault();
      setState((prev) => ({
        ...prev,
        dragOverId: id,
        offsetY: deltaY,
      }));
    }
  }, []);

  const handleTouchEnd = useCallback((_e: React.TouchEvent<HTMLDivElement>) => {
    if (draggedElementRef.current) {
      draggedElementRef.current.style.opacity = '1';
      draggedElementRef.current.style.pointerEvents = 'auto';
      draggedElementRef.current.style.zIndex = '';
    }
    touchStartPosRef.current = null;
    startTimeRef.current = 0;
    isDraggingRef.current = false;
  }, []);

  const reset = useCallback(() => {
    setState({
      draggedId: null,
      dragOverId: null,
      offsetY: 0,
      isDragging: false,
    });
    if (draggedElementRef.current) {
      draggedElementRef.current.style.opacity = '1';
      draggedElementRef.current.style.pointerEvents = 'auto';
      draggedElementRef.current.style.zIndex = '';
    }
    isDraggingRef.current = false;
    touchStartPosRef.current = null;
    startTimeRef.current = 0;
  }, []);

  return {
    state,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    reset,
  };
}
