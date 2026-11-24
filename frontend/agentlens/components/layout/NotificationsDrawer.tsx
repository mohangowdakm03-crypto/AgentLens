'use client';

import { X, CheckCircle2, AlertTriangle, Info, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const NOTIFICATIONS = [
  {
    id: 1,
    type: 'alert',
    title: 'Scope Creep Flagged in Trace seed_003',
    desc: 'Unauthorized email dispatched to client billing without explicit authorization.',
    time: '2 mins ago',
    href: '/trace-analysis?id=seed_003',
    badge: 'Scope Creep',
    color: '#DC2626',
  },
  {
    id: 2,
    type: 'warning',
    title: 'Semantic Drift Detected in Trace seed_002',
    desc: 'Agent deviated into home orchid care guide after resolving botanical hours query.',
    time: '8 mins ago',
    href: '/trace-analysis?id=seed_002',
    badge: 'Semantic Drift',
    color: '#D97706',
  },
  {
    id: 3,
    type: 'success',
    title: 'Benchmark Quality Gateway Passed',
    desc: 'All 7 evaluation criteria validated across 300 benchmark traces with 0 schema violations.',
    time: '25 mins ago',
    href: '/dataset-manager',
    badge: 'Validated',
    color: '#059669',
  },
  {
    id: 4,
    type: 'info',
    title: 'Counterfactual Prompt Repair Verified',
    desc: 'Repaired prompt generated for seed_003 successfully prevents unauthorized action sequences.',
    time: '1 hr ago',
    href: '/prompt-correction?id=seed_003',
    badge: 'Repair Ready',
    color: '#4F46E5',
  },
];

export default function NotificationsDrawer({ isOpen, onClose }: NotificationsDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        zIndex: 9998,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          height: '100vh',
          background: '#FFFFFF',
          borderLeft: '1px solid #E2E8F0',
          boxShadow: '-8px 0 24px rgba(15, 23, 42, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '18px 20px',
            borderBottom: '1px solid #E2E8F0',
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
              Audit Notifications
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#64748B' }}>
              Real-time failure detections and model alerts
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              color: '#64748B',
              borderRadius: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Notifications List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {NOTIFICATIONS.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              onClick={onClose}
              style={{
                display: 'block',
                textDecoration: 'none',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 10,
                padding: '12px 14px',
                marginBottom: 10,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#4F46E5';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(41, 45, 50, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 10,
                    color: n.color,
                    background: `${n.color}18`,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {n.badge}
                </span>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>{n.time}</span>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#292D32', marginBottom: 4 }}>
                {n.title}
              </div>
              <div style={{ fontSize: 11.5, color: '#737982', lineHeight: 1.4 }}>
                {n.desc}
              </div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#4F46E5' }}>
                Inspect Trace <ArrowRight size={12} />
              </div>
            </Link>
          ))}
        </div>

        {/* Drawer Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #E2E8F0',
            background: '#F8FAFC',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 11, color: '#737982' }}>4 unread events</span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 11.5,
              fontWeight: 600,
              color: '#4F46E5',
              cursor: 'pointer',
            }}
          >
            Mark all as read
          </button>
        </div>
      </div>
    </div>
  );
}
