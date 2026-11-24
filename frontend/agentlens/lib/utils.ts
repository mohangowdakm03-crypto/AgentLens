// AgentLens — Shared design tokens & utility helpers

export const COLORS = {
  bgMain: '#F8FAFC',
  bgSidebar: '#090D16',
  bgCard: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  border: '#E2E8F0',
  borderSubtle: '#F1F5F9',
  accentPrimary: '#4F46E5',
  accentDrift: '#D97706',
  accentScope: '#DC2626',
  accentSuccess: '#059669',
  driftLight: 'rgba(217, 119, 6, 0.12)',
  scopeLight: 'rgba(220, 38, 38, 0.12)',
  primaryLight: 'rgba(79, 70, 229, 0.12)',
  successLight: 'rgba(5, 150, 105, 0.12)',
} as const;

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTimeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} mins ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs} hrs ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays} days ago`;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export type DeviationType = 'none' | 'drift' | 'scope_creep';

export function deviationLabel(type: DeviationType | string | null | undefined): string {
  if (!type || type === 'none') return 'Correct';
  if (type === 'drift') return 'Drift';
  if (type === 'scope_creep') return 'Scope Creep';
  return type;
}

export function deviationColor(type: DeviationType | string | null | undefined): string {
  if (!type || type === 'none') return COLORS.accentSuccess;
  if (type === 'drift') return COLORS.accentDrift;
  if (type === 'scope_creep') return COLORS.accentScope;
  return COLORS.textSecondary;
}

export function deviationBg(type: DeviationType | string | null | undefined): string {
  if (!type || type === 'none') return COLORS.successLight;
  if (type === 'drift') return COLORS.driftLight;
  if (type === 'scope_creep') return COLORS.scopeLight;
  return 'rgba(100, 116, 139, 0.1)';
}
