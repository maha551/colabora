import React from 'react';
import { Button } from './button';
import { Icon } from './Icon';
import { useTheme } from '../../hooks/useTheme';
import { cn } from './utils';

interface ThemeToggleProps {
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function ThemeToggle({ 
  className, 
  variant = 'ghost',
  size = 'icon'
}: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <Button
      variant={variant}
      size={size}
      onClick={toggleTheme}
      className={cn(className)}
      aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {resolvedTheme === 'dark' ? (
        <Icon name="Sun"  size="sm" forceDefault aria-hidden="true" />
      ) : (
        <Icon name="Moon" size="sm" forceDefault aria-hidden="true" />
      )}
      <span className="sr-only">
        {resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      </span>
    </Button>
  );
}

