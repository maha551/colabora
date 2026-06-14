import React, { useCallback, useEffect, useState } from 'react';
import { cn } from '../../ui/utils';
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion';
import { AGENDA_SHEET_SIZE_CLASSES } from './agendaSheetUtils';
import './agenda-sheet.css';

interface AgendaSheetFlipProps {
  ariaLabel: string;
  front: React.ReactNode;
  back: React.ReactNode;
  isToday?: boolean;
  flipped?: boolean;
  onFlippedChange?: (flipped: boolean) => void;
  showTouchToggle?: boolean;
}

export function AgendaSheetFlip({
  ariaLabel,
  front,
  back,
  isToday,
  flipped: flippedProp,
  onFlippedChange,
  showTouchToggle,
}: AgendaSheetFlipProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [internalFlipped, setInternalFlipped] = useState(false);
  const flipped = flippedProp ?? internalFlipped;

  const setFlipped = useCallback(
    (value: boolean) => {
      if (onFlippedChange) onFlippedChange(value);
      else setInternalFlipped(value);
    },
    [onFlippedChange]
  );

  useEffect(() => {
    if (!showTouchToggle || !flipped) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-agenda-sheet-flip]')) return;
      setFlipped(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showTouchToggle, flipped, setFlipped]);

  return (
    <div
      data-agenda-sheet-flip
      className={cn(
        'agenda-sheet-flip',
        AGENDA_SHEET_SIZE_CLASSES,
        'shrink-0 snap-start',
        flipped && 'is-flipped',
        isToday && 'agenda-sheet--today',
        reducedMotion && 'agenda-sheet-flip--reduced',
        showTouchToggle && 'agenda-sheet-flip--touch'
      )}
      role="group"
      aria-label={ariaLabel}
      aria-expanded={showTouchToggle ? flipped : undefined}
    >
      <div className="agenda-sheet-flip__inner h-full w-full">
        <div className="agenda-sheet-flip__face agenda-sheet-flip__front h-full w-full">{front}</div>
        <div className="agenda-sheet-flip__face agenda-sheet-flip__back h-full w-full">{back}</div>
      </div>
    </div>
  );
}

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(hover: none)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(hover: none)');
    const onChange = () => setCoarse(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return coarse;
}
