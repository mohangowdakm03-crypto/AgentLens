import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changePositive?: boolean;
  subtitle?: string;
  icon: React.ReactNode;
  accentColor?: string;
  accentBg?: string;
  bottomBarColor?: string;
}

export default function StatCard({
  title,
  value,
  change,
  changePositive = true,
  subtitle,
  icon,
  accentColor = '#4F46E5',
  accentBg = 'rgba(79, 70, 229, 0.1)',
  bottomBarColor = '#4F46E5',
}: StatCardProps) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Bottom accent line */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: bottomBarColor,
        }}
      />

      {/* Left Icon */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: accentBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: accentColor,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500, marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {value}
          </span>
          {change && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: changePositive ? '#059669' : '#DC2626',
                background: changePositive ? 'rgba(5, 150, 105, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                padding: '2px 7px',
                borderRadius: 5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              {changePositive ? '↑' : '↓'} {change}
            </span>
          )}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
