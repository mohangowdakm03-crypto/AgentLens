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
      <div style={{ padding: '24px 20px 18px' }}>
        <Link
          href="/overview"
          onClick={onNavigate}
          style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12 }}
        >
          {/* Logo Icon */}
          <div
            style={{
              width: 36,
              height: 36,
              background: 'linear-gradient(135deg, #4F46E5 0%, #06B6D4 100%)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(79, 70, 229, 0.35)',
              flexShrink: 0,
            }}
          >
            <Layers size={19} color="#FFFFFF" strokeWidth={2.4} />
          </div>
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: '#FFFFFF',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              AgentLens
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, fontWeight: 500 }}>
              LLM Agent Trace Auditor
            </div>
          </div>
        </Link>
      </div>

      {/* Main navigation */}
      <nav style={{ padding: '6px 12px', flex: 1 }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon, badge }) => {
          const active = isActive(href);
          const isNewAudit = href === '/new-audit';

          if (isNewAudit) {
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9.5px 14px',
                  borderRadius: 9,
                  margin: '4px 0 10px 0',
                  color: '#FFFFFF',
                  background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
                  fontWeight: 600,
                  fontSize: 13,
                  textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={16} strokeWidth={2.4} color="#FFFFFF" />
                <span style={{ color: '#FFFFFF', flex: 1, letterSpacing: '-0.01em' }}>{label}</span>
              </Link>
            );
          }

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
                color: active ? '#FFFFFF' : '#94A3B8',
                background: active ? 'rgba(99, 102, 241, 0.16)' : 'transparent',
                border: active ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid transparent',
                fontWeight: active ? 600 : 500,
                fontSize: 13,
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon
                size={16}
                strokeWidth={active ? 2.2 : 1.8}
                color={active ? '#818CF8' : '#94A3B8'}
              />
              <span style={{ color: active ? '#FFFFFF' : 'inherit', flex: 1 }}>{label}</span>
              {badge && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '1.5px 7px',
                    borderRadius: 10,
                    background: active ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.08)',
                    color: active ? '#E0E7FF' : '#94A3B8',
                    border: active ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
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
            margin: '22px 10px 8px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: '#64748B',
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
                color: active ? '#FFFFFF' : '#94A3B8',
                background: active ? 'rgba(99, 102, 241, 0.16)' : 'transparent',
                border: active ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid transparent',
                fontWeight: active ? 600 : 500,
                fontSize: 13,
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon
                size={16}
                strokeWidth={active ? 2.2 : 1.8}
                color={active ? '#818CF8' : '#94A3B8'}
              />
              <span style={{ color: active ? '#FFFFFF' : 'inherit', flex: 1 }}>{label}</span>
              {badge && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '1.5px 7px',
                    borderRadius: 10,
                    background: active ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.08)',
                    color: active ? '#E0E7FF' : '#94A3B8',
                    border: active ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
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
      <div style={{ padding: '12px 14px 20px' }}>
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: '12px 14px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 12,
              color: '#FFFFFF',
              lineHeight: 1.2,
            }}
          >
            AgentLens Engine
          </div>
          <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 2, fontWeight: 500 }}>
            Post-Hoc LLM Agent Auditor
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              marginTop: 10,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#10B981',
                boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.25)',
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#34D399',
              }}
            >
              ML Core &amp; Mistral Online
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
      {/* Desktop Sidebar (240px fixed layout for >= 1024px) */}
      <aside
        className="sidebar-desktop-container"
        style={{
          width: 240,
          minWidth: 240,
          background: '#090D16',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
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
            background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
            color: '#FFFFFF',
            border: 'none',
            boxShadow: '0 4px 16px rgba(79, 70, 229, 0.4)',
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
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(3px)',
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
          background: '#090D16',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.4)',
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
              color: '#94A3B8',
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
