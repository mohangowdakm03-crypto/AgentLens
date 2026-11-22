'use client';

import { useState, useEffect } from 'react';
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
  Menu,
  X,
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

interface SidebarNavProps {
  pathname: string;
  onNavigate?: () => void;
}

function SidebarNavContent({ pathname, onNavigate }: SidebarNavProps) {
  function isActive(href: string) {
    if (href === '/overview' && (pathname === '/' || pathname === '/overview')) return true;
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Brand Header */}
      <div style={{ padding: '22px 18px 16px' }}>
        <Link
          href="/overview"
          onClick={onNavigate}
          style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}
        >
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
              onClick={onNavigate}
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
              onClick={onNavigate}
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
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Close drawer on ESC key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Prevent background body scroll when mobile drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Desktop Sidebar (unchanged 228px fixed layout for >= 1024px) */}
      <aside
        className="sidebar-desktop-container"
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
          flexShrink: 0,
        }}
      >
        <SidebarNavContent pathname={pathname} />
      </aside>

      {/* Mobile Floating Menu Button (visible only < 1024px) */}
      <div className="sidebar-mobile-trigger" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 60 }}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isOpen}
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: '#829581',
            color: '#FFFFFF',
            border: 'none',
            boxShadow: '0 4px 14px rgba(41, 45, 50, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {isOpen ? <X size={22} strokeWidth={2.2} /> : <Menu size={22} strokeWidth={2.2} />}
        </button>
      </div>

      {/* Mobile Drawer Overlay Backdrop */}
      {isOpen && (
        <div
          className="sidebar-mobile-overlay"
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(2px)',
            zIndex: 70,
          }}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer Content */}
      <aside
        className="sidebar-mobile-drawer"
        aria-label="Mobile Navigation"
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 0,
          width: 260,
          maxWidth: '80vw',
          background: '#F0EFE9',
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.15)',
          zIndex: 80,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 14px 0' }}>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation menu"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#737982',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
            }}
          >
            <X size={20} />
          </button>
        </div>
        <SidebarNavContent pathname={pathname} onNavigate={() => setIsOpen(false)} />
      </aside>
    </>
  );
}
