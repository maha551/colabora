import type { CSSProperties } from 'react';
import { cn } from '../ui/utils';
import { getBuildVersionLabel, getBuildVersionTitle } from '../../lib/buildInfo';

interface BuildVersionLabelProps {
  className?: string;
  style?: CSSProperties;
}

export function BuildVersionLabel({ className, style }: BuildVersionLabelProps) {
  const label = getBuildVersionLabel();
  const title = getBuildVersionTitle();

  return (
    <p
      className={cn(
        'mt-1.5 text-[0.65rem] font-normal tabular-nums tracking-wide text-muted-foreground/55 select-all',
        className
      )}
      style={style}
      title={title}
      aria-label={title ? `Build ${label}, ${title}` : `Build ${label}`}
    >
      {label}
    </p>
  );
}
