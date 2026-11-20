// AgentLens — Shared design tokens & utility helpers

export const COLORS = {
  bgMain: '#F8F7F3',
  bgSidebar: '#F0EFE9',
  bgCard: '#FFFFFF',
  textPrimary: '#292D32',
  textSecondary: '#737982',
  border: '#E6E5DF',
  accentPrimary: '#829581',
  accentDrift: '#C49A5B',
  accentScope: '#B97878',
  accentSuccess: '#72947A',
  driftLight: 'rgba(196, 154, 91, 0.12)',
  scopeLight: 'rgba(185, 120, 120, 0.12)',
  primaryLight: 'rgba(130, 149, 129, 0.12)',
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
  if (!type || type === 'none') return 'rgba(114, 148, 122, 0.1)';
  if (type === 'drift') return COLORS.driftLight;
  if (type === 'scope_creep') return COLORS.scopeLight;
  return 'rgba(115, 121, 130, 0.1)';
}
