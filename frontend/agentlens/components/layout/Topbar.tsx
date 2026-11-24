'use client';

import { useState, useEffect } from 'react';
import { Bell, Search, ChevronDown, CheckCircle2, ShieldCheck } from 'lucide-react';
import CommandPalette from './CommandPalette';
import NotificationsDrawer from './NotificationsDrawer';

interface TopbarProps {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
}

export default function Topbar({ title, subtitle, breadcrumb = 'AGENTLENS' }: TopbarProps) {
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    const handleOpenCommand = () => setIsCommandOpen(true);
    window.addEventListener('open-command-palette', handleOpenCommand);
    return () => window.removeEventListener('open-command-palette', handleOpenCommand);
  }, []);

  return (
    <>
      <header
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          padding: '20px 32px',
          gap: 20,
          position: 'sticky',
          top: 0,
          zIndex: 20,
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
        }}
      >
        {/* Title section */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#64748B',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{breadcrumb}</span>
            <span style={{ color: '#CBD5E1' }}>/</span>
            <span style={{ color: '#059669', fontWeight: 600 }}>MONITORING ACTIVE</span>
          </div>
          <h1
            style={{
              fontSize: 21,
              fontWeight: 700,
              color: '#0F172A',
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
              margin: 0,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                fontSize: 12.5,
                color: '#475569',
                marginTop: 3,
                margin: '3px 0 0 0',
                lineHeight: 1.4,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {/* Search Trigger */}
          <div
            onClick={() => setIsCommandOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              padding: '7px 12px',
              width: 290,
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#6366F1';
              e.currentTarget.style.background = '#FFFFFF';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#E2E8F0';
              e.currentTarget.style.background = '#F8FAFC';
            }}
          >
            <Search size={14} color="#64748B" strokeWidth={1.8} />
            <span
              style={{
                fontSize: 12,
                color: '#64748B',
                flex: 1,
                userSelect: 'none',
              }}
            >
              Search traces, prompts, or IDs...
            </span>
            <kbd
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#475569',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 4,
                padding: '2px 6px',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              Ctrl K
            </kbd>
          </div>

          {/* Bell with red indicator */}
          <div
            onClick={() => setIsNotificationsOpen(true)}
            style={{
              position: 'relative',
              width: 36,
              height: 36,
              borderRadius: 8,
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F8FAFC';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#FFFFFF';
            }}
          >
            <Bell size={16} color="#64748B" strokeWidth={1.8} />
            <div
              style={{
                position: 'absolute',
                top: 7,
                right: 7,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#EF4444',
                border: '1px solid #FFFFFF',
              }}
            />
          </div>

          {/* Profile pill with dropdown */}
          <div style={{ position: 'relative' }}>
            <div
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 10px 4px 5px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                MA
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#0F172A', lineHeight: 1.1 }}>
                  Lead Auditor
                </span>
                <span style={{ fontSize: 9.5, color: '#64748B' }}>Enterprise</span>
              </div>
              <ChevronDown size={13} color="#64748B" />
            </div>

            {isProfileOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '110%',
                  width: 220,
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                  padding: '8px',
                  zIndex: 100,
                }}
              >
                <div style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>AgentLens Auditor</div>
                  <div style={{ fontSize: 10.5, color: '#64748B' }}>workspace: prod-evaluation</div>
                </div>
                <div style={{ padding: '6px 0' }}>
                  <div
                    style={{
                      padding: '7px 10px',
                      fontSize: 12,
                      color: '#0F172A',
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F8FAFC';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                    onClick={() => {
                      setIsProfileOpen(false);
                      setIsCommandOpen(true);
                    }}
                  >
                    <Search size={14} color="#64748B" />
                    <span>Command Palette</span>
                  </div>
                  <div
                    style={{
                      padding: '7px 10px',
                      fontSize: 12,
                      color: '#0F172A',
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F8FAFC';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                    onClick={() => setIsProfileOpen(false)}
                  >
                    <ShieldCheck size={14} color="#4F46E5" />
                    <span>Audit Security Model</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Command Palette Modal */}
      <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} />

      {/* Global Notifications Drawer */}
      <NotificationsDrawer isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} />
    </>
  );
}
