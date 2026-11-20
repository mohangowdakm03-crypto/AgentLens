import React from 'react';
import { CheckCircle2, AlertTriangle, Clock, AlertCircle } from 'lucide-react';
import { deviationLabel, deviationColor, deviationBg } from '@/lib/utils';

interface BadgeProps {
  type: 'none' | 'drift' | 'scope_creep' | string | null | undefined;
  size?: 'sm' | 'md';
  showDot?: boolean;
}

export function DeviationBadge({ type, size = 'md', showDot = false }: BadgeProps) {
  const color = deviationColor(type);
  const bg = deviationBg(type);
  const label = deviationLabel(type);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: showDot ? 5 : 0,
        padding: size === 'sm' ? '3px 10px' : '4px 12px',
        borderRadius: 12,
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 500,
        color,
        background: bg,
        whiteSpace: 'nowrap',
      }}
    >
      {showDot && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  );
}

interface StatusBadgeProps {
  status: 'correct' | 'deviation' | 'pending' | 'error' | string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  if (status === 'correct') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: size === 'sm' ? '2px 8px' : '4px 10px',
          borderRadius: 6,
          fontSize: size === 'sm' ? 12 : 13,
          fontWeight: 600,
          color: '#292D32',
          whiteSpace: 'nowrap',
        }}
      >
        <CheckCircle2 size={14} color="#72947A" strokeWidth={2.2} />
        <span>Correct</span>
      </span>
    );
  }

  if (status === 'deviation') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: size === 'sm' ? '2px 8px' : '4px 10px',
          borderRadius: 6,
          fontSize: size === 'sm' ? 12 : 13,
          fontWeight: 600,
          color: '#292D32',
          whiteSpace: 'nowrap',
        }}
      >
        <AlertTriangle size={14} color="#C49A5B" strokeWidth={2} />
        <span>Deviation</span>
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: size === 'sm' ? '2px 8px' : '4px 10px',
        borderRadius: 6,
        fontSize: size === 'sm' ? 12 : 13,
        fontWeight: 500,
        color: '#737982',
        background: 'rgba(115, 121, 130, 0.08)',
        whiteSpace: 'nowrap',
      }}
    >
      <Clock size={13} color="#737982" />
      <span>{status}</span>
    </span>
  );
}

interface TagProps {
  children: React.ReactNode;
  color?: string;
  bg?: string;
}

export function Tag({ children, color = '#737982', bg = 'rgba(115,121,130,0.1)' }: TagProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 500,
        color,
        background: bg,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
