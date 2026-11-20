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
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          padding: '24px 32px 12px 32px',
          gap: 20,
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Title section */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#737982',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{breadcrumb}</span>
            <span style={{ color: '#C8C6BE' }}>/</span>
            <span style={{ color: '#829581', fontWeight: 600 }}>MONITORING ACTIVE</span>
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#292D32',
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
                color: '#737982',
                marginTop: 4,
                margin: '4px 0 0 0',
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
              background: '#FFFFFF',
              border: '1px solid #E6E5DF',
              borderRadius: 8,
              padding: '7px 12px',
              width: 290,
              boxShadow: '0 1px 2px rgba(41, 45, 50, 0.02)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#829581';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#E6E5DF';
            }}
          >
            <Search size={14} color="#737982" strokeWidth={1.8} />
            <span
              style={{
                fontSize: 12,
                color: '#737982',
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
                color: '#737982',
                background: '#F0EFE9',
                border: '1px solid #E6E5DF',
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
              border: '1px solid #E6E5DF',
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(41, 45, 50, 0.02)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F8F7F3';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#FFFFFF';
            }}
          >
            <Bell size={16} color="#737982" strokeWidth={1.8} />
            <div
              style={{
                position: 'absolute',
                top: 7,
                right: 7,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#B97878',
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
                border: '1px solid #E6E5DF',
                background: '#FFFFFF',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(41, 45, 50, 0.02)',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: '#829581',
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
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#292D32', lineHeight: 1.1 }}>
                  Lead Auditor
                </span>
                <span style={{ fontSize: 9.5, color: '#737982' }}>Enterprise</span>
              </div>
              <ChevronDown size={13} color="#737982" />
            </div>

            {isProfileOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '110%',
                  width: 220,
                  background: '#FFFFFF',
                  border: '1px solid #E6E5DF',
                  borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(41, 45, 50, 0.08)',
                  padding: '8px',
                  zIndex: 100,
                }}
              >
                <div style={{ padding: '8px 10px', borderBottom: '1px solid #F1F0E9' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#292D32' }}>AgentLens Auditor</div>
                  <div style={{ fontSize: 10.5, color: '#737982' }}>workspace: prod-evaluation</div>
                </div>
                <div style={{ padding: '6px 0' }}>
                  <div
                    style={{
                      padding: '7px 10px',
                      fontSize: 12,
                      color: '#292D32',
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F8F7F3';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                    onClick={() => {
                      setIsProfileOpen(false);
                      setIsCommandOpen(true);
                    }}
                  >
                    <Search size={14} color="#737982" />
                    <span>Command Palette</span>
                  </div>
                  <div
                    style={{
                      padding: '7px 10px',
                      fontSize: 12,
                      color: '#292D32',
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F8F7F3';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                    onClick={() => setIsProfileOpen(false)}
                  >
                    <ShieldCheck size={14} color="#829581" />
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
