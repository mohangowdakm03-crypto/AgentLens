'use client';

import { useState } from 'react';
import {
  Layers,
  AlertTriangle,
  GitBranch,
  Target,
  BarChart2,
  Clock,
  MoreHorizontal,
  ArrowRight,
  Info,
  ChevronDown,
  FileText,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import StatCard from '@/components/common/StatCard';
import { DeviationBadge, StatusBadge } from '@/components/common/Badge';

// ─── Data aligned with reference screenshot ───────────────────────────────────

const ACTIVITY_BY_RANGE: Record<string, { date: string; audits: number }[]> = {
  'Last 7 Days': [
    { date: 'Nov 05', audits: 19 },
    { date: 'Nov 06', audits: 14 },
    { date: 'Nov 07', audits: 22 },
    { date: 'Nov 08', audits: 28 },
    { date: 'Nov 09', audits: 25 },
    { date: 'Nov 10', audits: 30 },
    { date: 'Nov 11', audits: 32 },
  ],
  'Last 14 Days': [
    { date: 'Oct 29', audits: 12 },
    { date: 'Oct 31', audits: 16 },
    { date: 'Nov 02', audits: 22 },
    { date: 'Nov 04', audits: 18 },
    { date: 'Nov 06', audits: 24 },
    { date: 'Nov 08', audits: 28 },
    { date: 'Nov 11', audits: 32 },
  ],
  'Last 30 Days': [
    { date: 'Oct 12', audits: 8 },
    { date: 'Oct 15', audits: 12 },
    { date: 'Oct 18', audits: 10 },
    { date: 'Oct 21', audits: 15 },
    { date: 'Oct 24', audits: 11 },
    { date: 'Oct 27', audits: 18 },
    { date: 'Oct 30', audits: 14 },
    { date: 'Nov 02', audits: 22 },
    { date: 'Nov 05', audits: 19 },
    { date: 'Nov 08', audits: 28 },
    { date: 'Nov 11', audits: 32 },
  ],
  'Last 90 Days': [
    { date: 'Aug', audits: 64 },
    { date: 'Sep', audits: 112 },
    { date: 'Oct', audits: 178 },
    { date: 'Nov', audits: 300 },
  ],
};

const OUTCOME_DATA = [
  { name: 'None (Nominal)', value: 146, color: '#72947A', pct: '48.7%' },
  { name: 'Scope Creep', value: 115, color: '#B97878', pct: '38.3%' },
  { name: 'Semantic Drift', value: 34, color: '#C49A5B', pct: '11.3%' },
  { name: 'Misinterpretation', value: 5, color: '#9B8FC0', pct: '1.7%' },
];

const RECENT_TRACES = [
  {
    id: 'AL-0300',
    prompt: 'Organize my emails and summarize the important ones...',
    result: 'correct',
    deviation: null,
    time: '2 mins ago',
  },
  {
    id: 'AL-0299',
    prompt: 'Find the latest research papers on LLM agents...',
    result: 'deviation',
    deviation: 'drift',
    time: '5 mins ago',
  },
  {
    id: 'AL-0298',
    prompt: 'Book a meeting with the project team and also order lunch...',
    result: 'deviation',
    deviation: 'scope_creep',
    time: '8 mins ago',
  },
];

const RECENT_ACTIVITY = [
  { label: 'Dataset audited (300 traces)', time: '3 mins ago', color: '#72947A', filled: true },
  { label: 'Deviation analysis completed', time: '5 mins ago', color: '#72947A', filled: true },
  { label: 'Evaluation metrics updated', time: '8 mins ago', color: '#829581', filled: false },
  { label: 'New audit: AL-0300', time: '10 mins ago', color: '#737982', filled: false },
];

const EVAL_METRICS = [
  { label: 'Accuracy', value: '0.94', icon: Target },
  { label: 'Precision', value: '0.93', icon: Layers },
  { label: 'Recall', value: '0.95', icon: BarChart2 },
  { label: 'F1-Score', value: '0.94', isSigma: true },
];

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number | string }>;
  label?: string | number;
}

function CustomTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E6E5DF',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(41,45,50,0.08)',
        fontSize: 12,
      }}
    >
      <div style={{ color: '#737982', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 600, color: '#292D32' }}>{String(payload[0].value ?? '')} audits</div>
    </div>
  );
}

export default function OverviewPage() {
  const [timeRange, setTimeRange] = useState('Last 30 Days');
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const currentChartData = ACTIVITY_BY_RANGE[timeRange] || ACTIVITY_BY_RANGE['Last 30 Days'];

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: '#F8F7F3',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* Decorative organic landscape waves matching the screenshot top right */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '65%',
          height: 180,
          pointerEvents: 'none',
          opacity: 0.35,
          zIndex: 0,
        }}
        viewBox="0 0 800 200"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M0 130 C 200 60, 450 170, 800 40 L 800 0 L 0 0 Z"
          fill="url(#waveGrad1)"
        />
        <path
          d="M100 160 C 350 90, 550 190, 800 100 L 800 0 L 100 0 Z"
          fill="url(#waveGrad2)"
        />
        <defs>
          <linearGradient id="waveGrad1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#829581" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#829581" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="waveGrad2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#829581" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#829581" stopOpacity="0.01" />
          </linearGradient>
        </defs>
      </svg>

      {/* Top Header */}
      <Topbar
        title="Audit & Analyse LLM Agent Behaviour"
        subtitle="Detect deviations, explain causes, and generate corrected prompts."
      />

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          padding: '12px 32px 32px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* 1. Four KPI Cards Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
          }}
        >
          <StatCard
            title="Total Corpus Traces"
            value="300"
            change="13/13 Checks"
            changePositive
            subtitle="150 AI/ML, 150 Software Dev"
            icon={<Layers size={22} strokeWidth={1.8} />}
            accentColor="#829581"
            accentBg="rgba(130, 149, 129, 0.12)"
            bottomBarColor="#829581"
          />
          <StatCard
            title="Deviations Detected"
            value="154"
            change="51.3%"
            changePositive={false}
            subtitle="Total ground truth anomalies"
            icon={<AlertTriangle size={22} strokeWidth={1.8} />}
            accentColor="#B97878"
            accentBg="rgba(185, 120, 120, 0.12)"
            bottomBarColor="#B97878"
          />
          <StatCard
            title="Scope Creep Cases"
            value="115"
            change="38.3%"
            changePositive={false}
            subtitle="Action whitelist breaches"
            icon={<Layers size={22} strokeWidth={1.8} />}
            accentColor="#B97878"
            accentBg="rgba(185, 120, 120, 0.12)"
            bottomBarColor="#B97878"
          />
          <StatCard
            title="Semantic Drift Cases"
            value="34"
            change="11.3%"
            changePositive
            subtitle="PELT change-point drops"
            icon={<GitBranch size={22} strokeWidth={1.8} />}
            accentColor="#C49A5B"
            accentBg="rgba(196, 154, 91, 0.12)"
            bottomBarColor="#C49A5B"
          />
        </div>

        {/* 2. Middle Row: Donut Chart & Evaluation Performance */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Audit Outcome Distribution */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              padding: '22px 24px',
              boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#292D32' }}>
                Audit Outcome Distribution
              </span>
              <Info size={14} color="#737982" strokeWidth={1.6} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
              {/* Donut Chart */}
              <div style={{ position: 'relative', width: 145, height: 145, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={OUTCOME_DATA}
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={66}
                      startAngle={90}
                      endAngle={-270}
                      dataKey="value"
                      strokeWidth={2}
                      stroke="#FFFFFF"
                    >
                      {OUTCOME_DATA.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: '#292D32',
                      letterSpacing: '-0.02em',
                      lineHeight: 1.1,
                    }}
                  >
                    300
                  </div>
                  <div style={{ fontSize: 11, color: '#737982' }}>Traces</div>
                </div>
              </div>

              {/* Legend List */}
              <div style={{ flex: 1 }}>
                {OUTCOME_DATA.map((item) => (
                  <div
                    key={item.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: '1px solid #F1F0E9',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: item.color,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 13, color: '#292D32' }}>{item.name}</span>
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        color: '#737982',
                        fontFamily: 'IBM Plex Mono, monospace',
                      }}
                    >
                      {item.value} <span style={{ color: '#737982' }}>({item.pct})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Evaluation Performance */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              padding: '22px 24px',
              boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#292D32' }}>
                Evaluation Performance
              </span>
              <Info size={14} color="#737982" strokeWidth={1.6} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                margin: 'auto 0',
              }}
            >
              {EVAL_METRICS.map((m) => {
                const IconComponent = m.icon;
                return (
                  <div
                    key={m.label}
                    style={{
                      textAlign: 'center',
                      padding: '18px 10px',
                      background: '#F8F7F3',
                      borderRadius: 10,
                      border: '1px solid #E6E5DF',
                    }}
                  >
                    <div
                      style={{
                        color: '#829581',
                        marginBottom: 10,
                        display: 'flex',
                        justifyContent: 'center',
                      }}
                    >
                      {m.isSigma ? (
                        <span style={{ fontSize: 18, fontWeight: 600, lineHeight: 1 }}>Σ</span>
                      ) : (
                        IconComponent && <IconComponent size={20} strokeWidth={1.8} />
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#737982', marginBottom: 6 }}>
                      {m.label}
                    </div>
                    <div
                      style={{
                        fontSize: 26,
                        fontWeight: 700,
                        color: '#292D32',
                        letterSpacing: '-0.02em',
                        fontFamily: 'IBM Plex Mono, monospace',
                      }}
                    >
                      {m.value}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 3. Third Row: Audit Activity Trend & Deviation Types */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>

          {/* Audit Activity Trend */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              padding: '20px 24px',
              boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: '#292D32' }}>
                Audit Activity Trend
              </span>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setTimeDropdownOpen(!timeDropdownOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: '#292D32',
                    background: '#F8F7F3',
                    border: '1px solid #E6E5DF',
                    borderRadius: 6,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {timeRange}
                  <ChevronDown
                    size={13}
                    strokeWidth={2}
                    style={{
                      transform: timeDropdownOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.15s ease',
                    }}
                  />
                </button>
                {timeDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 4,
                      background: '#FFFFFF',
                      border: '1px solid #E6E5DF',
                      borderRadius: 8,
                      boxShadow: '0 4px 14px rgba(41,45,50,0.1)',
                      zIndex: 50,
                      minWidth: 130,
                      overflow: 'hidden',
                    }}
                  >
                    {['Last 7 Days', 'Last 14 Days', 'Last 30 Days', 'Last 90 Days'].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setTimeRange(opt);
                          setTimeDropdownOpen(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 12px',
                          fontSize: 12,
                          background: timeRange === opt ? '#F8F7F3' : 'transparent',
                          color: timeRange === opt ? '#829581' : '#292D32',
                          fontWeight: timeRange === opt ? 600 : 400,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={150}>
              <AreaChart
                data={currentChartData}
                margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="auditGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#829581" stopOpacity="0.25" />
                    <stop offset="95%" stopColor="#829581" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F0E9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#737982' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  ticks={[0, 10, 20, 30, 40]}
                  domain={[0, 40]}
                  tick={{ fontSize: 10, fill: '#737982' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="audits"
                  stroke="#829581"
                  strokeWidth={2}
                  fill="url(#auditGrad)"
                  dot={{ fill: '#829581', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#829581', strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Deviation Types (200) */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              padding: '20px 24px',
              boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#292D32' }}>
                Deviation Types (200)
              </span>
              <Info size={14} color="#737982" strokeWidth={1.6} />
            </div>

            <div style={{ margin: 'auto 0' }}>
              {/* Stacked segmented bar */}
              <div
                style={{
                  display: 'flex',
                  borderRadius: 6,
                  overflow: 'hidden',
                  height: 32,
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    background: '#72947A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  33.3%
                </div>
                <div
                  style={{
                    flex: 1,
                    background: '#C49A5B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  33.3%
                </div>
                <div
                  style={{
                    flex: 1,
                    background: '#B97878',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  33.3%
                </div>
              </div>

              {/* Legend */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: '#72947A',
                    }}
                  />
                  <span style={{ fontSize: 12, color: '#737982' }}>None (100)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: '#C49A5B',
                    }}
                  />
                  <span style={{ fontSize: 12, color: '#737982' }}>Drift (100)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: '#B97878',
                    }}
                  />
                  <span style={{ fontSize: 12, color: '#737982' }}>Scope Creep (100)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Fourth Row: Recent Audit Traces & Recent Activity */}
        <div style={{ display: 'grid', gridTemplateColumns: '2.1fr 1fr', gap: 16 }}>

          {/* Recent Audit Traces */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #E6E5DF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={16} color="#829581" strokeWidth={1.8} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#292D32' }}>
                  Recent Audit Traces
                </span>
              </div>
              <Link
                href="/trace-explorer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 12,
                  color: '#829581',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                View All <ArrowRight size={13} strokeWidth={2} />
              </Link>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8F7F3' }}>
                  <th style={{ width: 36, padding: '10px 14px' }}>
                    <input type="checkbox" style={{ accentColor: '#829581' }} />
                  </th>
                  {['Trace ID', 'Original Prompt', 'Result', 'Deviation Type', 'Time', ''].map(
                    (h, i) => (
                      <th
                        key={i}
                        style={{
                          padding: '10px 14px',
                          textAlign: 'left',
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#737982',
                          borderBottom: '1px solid #E6E5DF',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {RECENT_TRACES.map((trace, idx) => (
                  <tr
                    key={trace.id}
                    style={{
                      borderBottom:
                        idx < RECENT_TRACES.length - 1 ? '1px solid #F1F0E9' : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLTableRowElement).style.background = '#F8F7F3')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLTableRowElement).style.background = '')
                    }
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <input type="checkbox" style={{ accentColor: '#829581' }} />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Link
                        href={`/trace-analysis?id=${trace.id}`}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#292D32',
                          textDecoration: 'none',
                          fontFamily: 'IBM Plex Mono, monospace',
                        }}
                      >
                        {trace.id}
                      </Link>
                    </td>
                    <td style={{ padding: '12px 14px', maxWidth: 280 }}>
                      <span style={{ fontSize: 12, color: '#737982' }}>{trace.prompt}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <StatusBadge status={trace.result} size="sm" />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {trace.deviation ? (
                        <DeviationBadge type={trace.deviation} size="sm" />
                      ) : (
                        <span style={{ fontSize: 12, color: '#737982' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, color: '#737982' }}>{trace.time}</span>
                    </td>
                    <td style={{ padding: '12px 14px', position: 'relative' }}>
                      <button
                        onClick={() => setActiveMenuId(activeMenuId === trace.id ? null : trace.id)}
                        title="Trace actions"
                        style={{
                          background: activeMenuId === trace.id ? '#F0EFE9' : 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#737982',
                          padding: 4,
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <MoreHorizontal size={15} strokeWidth={1.75} />
                      </button>
                      {activeMenuId === trace.id && (
                        <div
                          style={{
                            position: 'absolute',
                            right: 14,
                            top: 40,
                            background: '#FFFFFF',
                            border: '1px solid #E6E5DF',
                            borderRadius: 8,
                            boxShadow: '0 4px 16px rgba(41,45,50,0.12)',
                            zIndex: 40,
                            minWidth: 175,
                            padding: '4px 0',
                          }}
                        >
                          <Link
                            href={`/trace-analysis?id=${trace.id}`}
                            onClick={() => setActiveMenuId(null)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 12px',
                              fontSize: 12,
                              color: '#292D32',
                              textDecoration: 'none',
                            }}
                          >
                            <FileText size={13} color="#829581" />
                            Inspect in Review
                          </Link>
                          <Link
                            href={`/deviation-analysis?id=${trace.id}`}
                            onClick={() => setActiveMenuId(null)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 12px',
                              fontSize: 12,
                              color: '#292D32',
                              textDecoration: 'none',
                            }}
                          >
                            <AlertTriangle size={13} color="#C49A5B" />
                            Deviation Details
                          </Link>
                          <Link
                            href={`/causal-explanation?id=${trace.id}`}
                            onClick={() => setActiveMenuId(null)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 12px',
                              fontSize: 12,
                              color: '#292D32',
                              textDecoration: 'none',
                            }}
                          >
                            <GitBranch size={13} color="#829581" />
                            View Causal DAG
                          </Link>
                          <Link
                            href={`/prompt-correction?id=${trace.id}`}
                            onClick={() => setActiveMenuId(null)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 12px',
                              fontSize: 12,
                              color: '#292D32',
                              textDecoration: 'none',
                            }}
                          >
                            <Sparkles size={13} color="#829581" />
                            Prompt Repair
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recent Activity */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              padding: '20px 24px',
              boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 20,
              }}
            >
              <Clock size={16} color="#829581" strokeWidth={1.8} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#292D32' }}>
                Recent Activity
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {RECENT_ACTIVITY.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 14, position: 'relative' }}>
                  {/* Timeline vertical connector line */}
                  {idx < RECENT_ACTIVITY.length - 1 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 5,
                        top: 14,
                        bottom: 0,
                        width: 1,
                        background: '#E6E5DF',
                      }}
                    />
                  )}
                  {/* Status dot */}
                  <div
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: '50%',
                      background: item.filled ? item.color : '#FFFFFF',
                      border: `2px solid ${item.color}`,
                      marginTop: 3,
                      flexShrink: 0,
                      position: 'relative',
                      zIndex: 1,
                    }}
                  />
                  <div style={{ flex: 1, paddingBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#292D32', lineHeight: 1.4 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 11, color: '#737982', marginTop: 2 }}>
                      {item.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
