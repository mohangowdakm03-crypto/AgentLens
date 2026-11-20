'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Plus,
  Layers,
  FileText,
  AlertTriangle,
  GitBranch,
  Sparkles,
  Clock,
  BarChart2,
  Database,
  Download,
  Settings,
  CheckCircle2,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/new-audit', label: 'New Audit', icon: Plus },
  { href: '/trace-explorer', label: 'Trace Explorer', icon: Layers, badge: '126' },
  { href: '/trace-analysis', label: 'Trace Analysis', icon: FileText },
  { href: '/deviation-analysis', label: 'Deviation Analysis', icon: AlertTriangle, badge: '64' },
  { href: '/causal-explanation', label: 'Causal Explanation', icon: GitBranch },
  { href: '/prompt-correction', label: 'Prompt Correction', icon: Sparkles },
  { href: '/audit-history', label: 'Audit History', icon: Clock },
  { href: '/evaluation', label: 'Evaluation', icon: BarChart2 },
];

const BOTTOM_NAV = [
  { href: '/dataset-manager', label: 'Dataset Manager', icon: Database, badge: '300' },
  { href: '/export', label: 'Export & Reports', icon: Download },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/overview' && (pathname === '/' || pathname === '/overview')) return true;
    return pathname.startsWith(href);
  }

  return (
    <aside
      style={{
        width: 228,
        minWidth: 228,
        background: '#F0EFE9',
        borderRight: '1px solid #E6E5DF',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        overflowY: 'auto',
      }}
    >
      {/* Brand Header */}
      <div style={{ padding: '22px 18px 16px' }}>
        <Link href="/overview" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Logo Icon */}
          <div
            style={{
              width: 32,
              height: 32,
              background: '#829581',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(41, 45, 50, 0.08)',
            }}
          >
            <Layers size={17} color="#FFFFFF" strokeWidth={2.2} />
          </div>
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                color: '#292D32',
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
              }}
            >
              AgentLens
            </div>
            <div style={{ fontSize: 10, color: '#737982', marginTop: 2 }}>
              LLM Agent Trace Auditor
            </div>
          </div>
        </Link>
      </div>

      {/* Main navigation */}
      <nav style={{ padding: '6px 12px', flex: 1 }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon, badge }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8.5px 12px',
                borderRadius: 8,
                marginBottom: 3,
                color: active ? '#FFFFFF' : '#737982',
                background: active ? '#829581' : 'transparent',
                fontWeight: active ? 600 : 500,
                fontSize: 13,
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(130, 149, 129, 0.12)';
                  (e.currentTarget as HTMLAnchorElement).style.color = '#292D32';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                  (e.currentTarget as HTMLAnchorElement).style.color = '#737982';
                }
              }}
            >
              <Icon
                size={16}
                strokeWidth={active ? 2.2 : 1.8}
                color={active ? '#FFFFFF' : 'currentColor'}
              />
              <span style={{ color: active ? '#FFFFFF' : 'inherit', flex: 1 }}>{label}</span>
              {badge && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 10,
                    background: active ? 'rgba(255, 255, 255, 0.22)' : 'rgba(130, 149, 129, 0.15)',
                    color: active ? '#FFFFFF' : '#829581',
                  }}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}

        {/* Section Divider: DATA & SETTINGS */}
        <div
          style={{
            margin: '20px 10px 8px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#737982',
            textTransform: 'uppercase',
          }}
        >
          DATA &amp; SETTINGS
        </div>

        {BOTTOM_NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8.5px 12px',
                borderRadius: 8,
                marginBottom: 3,
                color: active ? '#FFFFFF' : '#737982',
                background: active ? '#829581' : 'transparent',
                fontWeight: active ? 600 : 500,
                fontSize: 13,
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(130, 149, 129, 0.12)';
                  (e.currentTarget as HTMLAnchorElement).style.color = '#292D32';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                  (e.currentTarget as HTMLAnchorElement).style.color = '#737982';
                }
              }}
            >
              <Icon
                size={16}
                strokeWidth={active ? 2.2 : 1.8}
                color={active ? '#FFFFFF' : 'currentColor'}
              />
              <span style={{ color: active ? '#FFFFFF' : 'inherit', flex: 1 }}>{label}</span>
              {badge && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 10,
                    background: active ? 'rgba(255, 255, 255, 0.22)' : 'rgba(130, 149, 129, 0.15)',
                    color: active ? '#FFFFFF' : '#829581',
                  }}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Status Card */}
      <div style={{ padding: '12px 14px 18px' }}>
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E6E5DF',
            borderRadius: 10,
            padding: '12px 14px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Subtle wave background */}
          <svg
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              width: '100%',
              height: 36,
              opacity: 0.18,
              pointerEvents: 'none',
            }}
            viewBox="0 0 200 60"
            fill="none"
          >
            <path
              d="M0 40 Q 50 15, 100 35 T 200 25 L 200 60 L 0 60 Z"
              fill="#829581"
            />
          </svg>

          <div
            style={{
              fontWeight: 700,
              fontSize: 12,
              color: '#292D32',
              lineHeight: 1.2,
            }}
          >
            AgentLens v1.0
          </div>
          <div style={{ fontSize: 10, color: '#737982', marginTop: 2 }}>
            Post-Hoc LLM Agent Auditor
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 10,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#72947A',
                boxShadow: '0 0 0 2px rgba(114, 148, 122, 0.25)',
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#72947A',
              }}
            >
              System Ready
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
