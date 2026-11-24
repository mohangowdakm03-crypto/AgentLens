import React from 'react';

interface CardProps {
  title?: string;
  titleExtra?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
  info?: string;
}

export default function Card({ title, titleExtra, children, style, bodyStyle, info }: CardProps) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{title}</span>
            {info && (
              <div
                title={info}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: '#64748B',
                  cursor: 'help',
                  fontStyle: 'italic',
                  fontWeight: 600,
                }}
              >
                i
              </div>
            )}
          </div>
          {titleExtra && <div>{titleExtra}</div>}
        </div>
      )}
      <div style={{ padding: 20, ...bodyStyle }}>{children}</div>
    </div>
  );
}
