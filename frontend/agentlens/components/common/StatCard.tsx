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
  accentColor = '#829581',
  accentBg = 'rgba(130, 149, 129, 0.1)',
  bottomBarColor = '#829581',
}: StatCardProps) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 12,
        border: '1px solid #E6E5DF',
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 1px 3px rgba(41, 45, 50, 0.04)',
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
        <div style={{ fontSize: 12, color: '#737982', fontWeight: 500, marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: '#292D32', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {value}
          </span>
          {change && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: changePositive ? '#72947A' : '#B97878',
                background: changePositive ? 'rgba(114, 148, 122, 0.12)' : 'rgba(185, 120, 120, 0.12)',
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
          <div style={{ fontSize: 11, color: '#737982', marginTop: 4 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
