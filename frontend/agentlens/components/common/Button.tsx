import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  style,
  disabled,
  ...props
}: ButtonProps) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 8,
    fontWeight: 500,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    border: 'none',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
    opacity: disabled || loading ? 0.6 : 1,
  };

  const sizes: Record<string, React.CSSProperties> = {
    sm: { fontSize: 12, padding: '6px 12px', height: 30 },
    md: { fontSize: 13, padding: '8px 16px', height: 36 },
    lg: { fontSize: 14, padding: '10px 20px', height: 42 },
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: {
      background: '#829581',
      color: 'white',
    },
    secondary: {
      background: '#FFFFFF',
      color: '#292D32',
      border: '1px solid #E8E6DF',
    },
    ghost: {
      background: 'transparent',
      color: '#737982',
    },
    danger: {
      background: 'rgba(185, 120, 120, 0.1)',
      color: '#B97878',
      border: '1px solid rgba(185, 120, 120, 0.2)',
    },
  };

  return (
    <button
      disabled={disabled || loading}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      {...props}
    >
      {loading ? (
        <span
          style={{
            width: 14,
            height: 14,
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
            flexShrink: 0,
          }}
        />
      ) : icon}
      {children}
      {iconRight && !loading && iconRight}
    </button>
  );
}
