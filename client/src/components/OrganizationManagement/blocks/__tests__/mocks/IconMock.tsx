import React from 'react';

export function Icon(props: { name?: string; className?: string }) {
  return <span data-testid="icon-mock" className={props.className}>{props.name ?? 'icon'}</span>;
}

