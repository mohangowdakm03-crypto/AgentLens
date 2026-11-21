'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Target,
  Layers,
  BarChart2,
  Info,
  CheckCircle2,
  Unlock,
  Play,
  Download,
  LoaderCircle,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import { getEvaluation } from '@/services/api';
import type { EvaluationReport, DeviationClassification } from '@/lib/types';

const CLASS_COLORS: Record<DeviationClassification, string> = {
  none: '#829581',
  drift: '#C49A5B',
  scope_creep: '#B97878',
  misinterpretation: '#737982',
};

const CLASS_DISPLAY_NAMES: Record<DeviationClassification, string> = {
  none: 'None (Nominal / Clean)',
  drift: 'Semantic Drift',
  scope_creep: 'Scope Creep',
  misinterpretation: 'Misinterpretation (Unsupported)',
};

export default function EvaluationPage() {
  const [split, setSplit] = useState<string>('test');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<string | null>(null);

  const fetchMetrics = useCallback(async (selectedSplit: string, forceRefresh: boolean = false) => {
    setIsEvaluating(true);
    setErrorNotice(null);
    try {
      const data = await getEvaluation({ split: selectedSplit, refresh: forceRefresh });
      setReport(data);
      setLastEvaluatedAt(new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) + ' UTC');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorNotice(`Failed to load evaluation metrics for split '${selectedSplit}': ${msg}`);
    } finally {
      setIsEvaluating(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics(split, false);
  }, [split, fetchMetrics]);

  const handleRunEvaluation = () => {
    fetchMetrics(split, true);
  };

  const handleExportCSV = () => {
    if (!report) return;

    const perClassRows = (['none', 'drift', 'scope_creep', 'misinterpretation'] as DeviationClassification[]).map((c) => {
      const item = report.per_class[c];
      return `${CLASS_DISPLAY_NAMES[c]},${item?.precision ?? 0},${item?.recall ?? 0},${item?.f1 ?? 0},${item?.support ?? 0},${item?.tp ?? 0},${item?.fp ?? 0},${item?.fn ?? 0},${item?.tn ?? 0}`;
    });

    const csvContent = [
      'Split,Dataset_Count,Evaluated_Count,Excluded_Count',
      `${report.evaluation_split},${report.dataset_count},${report.evaluated_count},${report.excluded_count}`,
      '',
      'Class,Precision,Recall,F1_Score,Support,TP,FP,FN,TN',
      ...perClassRows,
      '',
      'Metric,Score',
      `Binary_Accuracy,${report.trace_level.accuracy}`,
      `Binary_Precision,${report.trace_level.precision}`,
      `Binary_Recall,${report.trace_level.recall}`,
      `Binary_F1,${report.trace_level.f1}`,
      `Exact_Class_Accuracy,${report.trace_level.exact_class_accuracy}`,
      `Macro_F1,${report.trace_level.macro_f1}`,
      `Weighted_F1,${report.trace_level.weighted_f1}`,
      `Deviation_Macro_F1,${report.trace_level.deviation_macro_f1}`,
      `Step_Level_F1,${report.step_level.f1}`,
      `First_Step_Exact_Match_Rate,${report.step_level.first_step_exact_match_rate}`,
      `Evaluation_Timestamp,"${lastEvaluatedAt}"`,
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentlens_evaluation_${report.evaluation_split}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const traceMetrics = report?.trace_level;
  const metricsList = [
    { name: 'Binary Accuracy', value: traceMetrics?.accuracy ?? 0, icon: Target, bar: '#829581' },
    { name: 'Binary Precision', value: traceMetrics?.precision ?? 0, icon: Layers, bar: '#829581' },
    { name: 'Binary Recall', value: traceMetrics?.recall ?? 0, icon: BarChart2, bar: '#72947A' },
    { name: 'Binary F1-Score', value: traceMetrics?.f1 ?? 0, isSigma: true, bar: '#C49A5B' },
  ];

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
      <Topbar
        title="Evaluation Benchmarks"
        subtitle="Empirical batch evaluation metrics computed directly by the AgentLens ML Core (SentenceTransformers + PELT)."
        breadcrumb="AGENTLENS / BENCHMARK EVALUATION"
      />

      <main
        style={{
          flex: 1,
          padding: '12px 32px 32px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* EVALUATION CONTROL CARD */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: 'rgba(114, 148, 122, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Unlock size={18} color="#72947A" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#292D32' }}>
                    Dataset Split Batch Evaluation
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 10,
                      color: '#72947A',
                      background: 'rgba(114, 148, 122, 0.12)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Isolated Ground Truth
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#737982', marginTop: 2 }}>
                  Executes eligible split traces through <code>detector_service.run_detection()</code> with strict ground-truth isolation.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Split selection dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#737982' }}>
                <span style={{ fontWeight: 600 }}>Split:</span>
                <select
                  value={split}
                  onChange={(e) => setSplit(e.target.value)}
                  disabled={isEvaluating}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid #E6E5DF',
                    background: '#FFFFFF',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#292D32',
                    cursor: 'pointer',
                  }}
                >
                  <option value="test">test (28 traces)</option>
                  <option value="train">train</option>
                  <option value="validation">validation</option>
                </select>
              </div>

              <button
                onClick={handleExportCSV}
                disabled={!report}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 7,
                  border: '1px solid #E6E5DF',
                  background: '#FFFFFF',
                  color: '#292D32',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: report ? 'pointer' : 'not-allowed',
                  opacity: report ? 1 : 0.5,
                }}
              >
                <Download size={13} color="#829581" /> Export CSV Telemetry
              </button>

              <button
                onClick={handleRunEvaluation}
                disabled={isEvaluating}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 7,
                  border: 'none',
                  background: isEvaluating ? '#E6E5DF' : '#829581',
                  color: isEvaluating ? '#737982' : '#FFFFFF',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: isEvaluating ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {isEvaluating ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <Play size={13} fill="#FFFFFF" />
                )}
                {isEvaluating ? 'Evaluating Split...' : 'Run Split Evaluation (GET /api/evaluate)'}
              </button>
            </div>
          </div>

          <div
            style={{
              background: '#F8F7F3',
              borderRadius: 8,
              border: '1px solid #E6E5DF',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              fontSize: 11.5,
              color: '#737982',
            }}
          >
            <div style={{ display: 'flex', gap: 14 }}>
              <span>Split Evaluated: <strong style={{ color: '#292D32' }}>{report?.evaluation_split ?? split}</strong></span>
              <span>Dataset Source: <strong style={{ color: '#292D32' }}>{report?.dataset_source ?? 'loading...'}</strong></span>
              <span>Evaluated: <strong style={{ color: '#292D32' }}>{report?.evaluated_count ?? 0} traces</strong></span>
              <span>Excluded: <strong style={{ color: '#292D32' }}>{report?.excluded_count ?? 0} traces</strong></span>
            </div>
            <div>
              <span>Last Computed: <strong>{lastEvaluatedAt ?? 'Pending'}</strong></span>
            </div>
          </div>
        </div>

        {errorNotice && (
          <div
            style={{
              background: 'rgba(185, 120, 120, 0.1)',
              borderRadius: 12,
              border: '1px solid rgba(185, 120, 120, 0.3)',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 12.5,
              color: '#B97878',
            }}
          >
            <AlertTriangle size={16} />
            <span>{errorNotice}</span>
          </div>
        )}

        {/* 4 Primary KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {metricsList.map((m) => {
            const IconComponent = m.icon;
            return (
              <div
                key={m.name}
                style={{
                  background: '#FFFFFF',
                  borderRadius: 12,
                  border: '1px solid #E6E5DF',
                  padding: '18px 20px',
                  boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: m.bar }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: '#737982', fontWeight: 500 }}>{m.name}</span>
                  <div style={{ color: '#829581' }}>
                    {m.isSigma ? (
                      <span style={{ fontSize: 16, fontWeight: 700 }}>Σ</span>
                    ) : (
                      IconComponent && <IconComponent size={18} strokeWidth={1.8} />
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#292D32', letterSpacing: '-0.02em', fontFamily: 'IBM Plex Mono, monospace' }}>
                  {m.value.toFixed(4)}
                </div>
                <div style={{ fontSize: 11, color: '#737982', marginTop: 4 }}>
                  Computed on {report?.evaluated_count ?? 0} split traces
                </div>
              </div>
            );
          })}
        </div>

        {/* Secondary Metric Bar */}
        {report && (
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              padding: '14px 20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 12,
              boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            }}
          >
            <div>
              <span style={{ fontSize: 11, color: '#737982', display: 'block' }}>Exact 4-Class Accuracy</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#292D32', fontFamily: 'IBM Plex Mono, monospace' }}>
                {report.trace_level.exact_class_accuracy.toFixed(4)}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#737982', display: 'block' }}>Macro F1 (4 Classes)</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#292D32', fontFamily: 'IBM Plex Mono, monospace' }}>
                {report.trace_level.macro_f1.toFixed(4)}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#737982', display: 'block' }}>Deviation Macro F1</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#292D32', fontFamily: 'IBM Plex Mono, monospace' }}>
                {report.trace_level.deviation_macro_f1.toFixed(4)}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#737982', display: 'block' }}>Step-Level F1 Score</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#292D32', fontFamily: 'IBM Plex Mono, monospace' }}>
                {report.step_level.f1.toFixed(4)}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#737982', display: 'block' }}>1st-Step Exact Match</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#292D32', fontFamily: 'IBM Plex Mono, monospace' }}>
                {report.step_level.first_step_exact_match_rate.toFixed(4)}
              </span>
            </div>
          </div>
        )}

        {/* 2-Column: Real 4x4 Confusion Matrix + Real Per-Class Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
          {/* Real Multiclass Confusion Matrix */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              padding: '22px 24px',
              boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#292D32' }}>
                  4×4 Multiclass Confusion Matrix (Integer Counts)
                </span>
                <Info size={14} color="#737982" strokeWidth={1.6} />
              </div>
              <span style={{ fontSize: 11, color: '#737982' }}>Total: {report?.confusion_matrix.total ?? 0} traces</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px', fontSize: 11, color: '#737982', textAlign: 'left' }}>True \ Pred</th>
                    {['none', 'drift', 'scope_creep', 'misinterpret.'].map((h) => (
                      <th key={h} style={{ padding: '8px', fontSize: 11, color: '#737982', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report ? (
                    report.confusion_matrix.labels.map((rowLabel, rIdx) => (
                      <tr key={rowLabel}>
                        <td style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, color: '#292D32', textAlign: 'left' }}>
                          {rowLabel}
                        </td>
                        {report.confusion_matrix.rows[rIdx].map((count, cIdx) => {
                          const isDiag = rIdx === cIdx;
                          const bg = isDiag && count > 0
                            ? 'rgba(114, 148, 122, 0.22)'
                            : count > 0
                            ? 'rgba(185, 120, 120, 0.16)'
                            : '#F8F7F3';
                          const textCol = isDiag && count > 0 ? '#5F7C66' : count > 0 ? '#B97878' : '#737982';

                          return (
                            <td
                              key={cIdx}
                              style={{
                                padding: '10px 8px',
                                background: bg,
                                border: '2px solid #FFFFFF',
                                borderRadius: 6,
                                fontSize: 13,
                                fontWeight: 700,
                                color: textCol,
                                fontFamily: 'IBM Plex Mono, monospace',
                              }}
                            >
                              {count}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: 20, color: '#737982', fontSize: 12 }}>
                        Loading confusion matrix from backend...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 11, color: '#737982' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(114, 148, 122, 0.4)' }} />
                <span>Diagonal (Correct taxonomy predictions)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(185, 120, 120, 0.3)' }} />
                <span>Off-Diagonal (Misclassifications)</span>
              </div>
            </div>
          </div>

          {/* Error & Limitations Overview */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E6E5DF',
              padding: '22px 24px',
              boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: '#292D32' }}>
              Documented Limitations Impact Analysis
            </div>
            <p style={{ fontSize: 12, color: '#737982', margin: 0 }}>
              Specific edge cases quantified from ML Core constraints and permission audit:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ background: '#FAF9F6', borderRadius: 8, padding: '10px 12px', border: '1px solid #E6E5DF' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#292D32' }}>
                  <span>Short drift traces (&lt;3 steps)</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                    {report?.known_limitations.short_drift_traces_lt_3_steps.count ?? 0} traces
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#737982', margin: '4px 0 0 0' }}>
                  Cannot trigger PELT because find_drift_step() requires len(curve) ≥ 3.
                </p>
              </div>

              <div style={{ background: '#FAF9F6', borderRadius: 8, padding: '10px 12px', border: '1px solid #E6E5DF' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#292D32' }}>
                  <span>Resource-scoped permission cases</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                    {report?.known_limitations.resource_scoped_permission_cases.count ?? 0} traces
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#737982', margin: '4px 0 0 0' }}>
                  Action-level Intent schema cannot encode &quot;write report but do not write target resource&quot;.
                </p>
              </div>

              <div style={{ background: '#FAF9F6', borderRadius: 8, padding: '10px 12px', border: '1px solid #E6E5DF' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#292D32' }}>
                  <span>Misinterpretation class</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                    {report?.known_limitations.misinterpretation_unsupported.count ?? 0} traces
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#737982', margin: '4px 0 0 0' }}>
                  Detector only predicts &apos;none&apos;, &apos;drift&apos;, or &apos;scope_creep&apos;.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#737982', borderTop: '1px solid #E6E5DF', paddingTop: 10 }}>
              <span>False Positives: <strong>{report?.false_positives.length ?? 0}</strong></span>
              <span>False Negatives: <strong>{report?.false_negatives.length ?? 0}</strong></span>
              <span>Type Mismatches: <strong>{report?.type_mismatches.length ?? 0}</strong></span>
            </div>
          </div>
        </div>

        {/* Per-Class Telemetry Table */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#292D32' }}>
              Per-Class One-vs-Rest Telemetry ({report?.evaluated_count ?? 0} Trace Support in Split)
            </div>
            <span style={{ fontSize: 11, color: '#737982' }}>Canonical 4-class taxonomy</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8F7F3', borderBottom: '1px solid #E6E5DF' }}>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#737982' }}>FAILURE CLASS</th>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#737982' }}>PRECISION</th>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#737982' }}>RECALL</th>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#737982' }}>F1-SCORE</th>
                <th style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#737982' }}>SUPPORT</th>
                <th style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#737982' }}>PREDICTED</th>
                <th style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#737982' }}>TP / FP / FN</th>
              </tr>
            </thead>
            <tbody>
              {report ? (
                (['none', 'drift', 'scope_creep', 'misinterpretation'] as DeviationClassification[]).map((c) => {
                  const m = report.per_class[c];
                  if (!m) return null;
                  return (
                    <tr key={c} style={{ borderBottom: '1px solid #F1F0E9', fontSize: 12.5 }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#292D32' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: CLASS_COLORS[c] }} />
                          {CLASS_DISPLAY_NAMES[c]}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'IBM Plex Mono, monospace', color: '#292D32' }}>
                        {m.precision.toFixed(4)}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'IBM Plex Mono, monospace', color: '#292D32' }}>
                        {m.recall.toFixed(4)}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'IBM Plex Mono, monospace', color: '#292D32', fontWeight: 700 }}>
                        {m.f1.toFixed(4)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#737982', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {m.support}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#737982', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {m.predicted_count}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#737982', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {m.tp} / {m.fp} / {m.fn}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#737982', fontSize: 12 }}>
                    Loading per-class metrics from backend...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Notice of Fixed ML Core Thresholds */}
        <div
          style={{
            background: '#FAF9F6',
            borderRadius: 12,
            border: '1px solid #E6E5DF',
            padding: '14px 20px',
            fontSize: 12,
            color: '#737982',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: '#292D32' }}>ML Core Hyperparameters Notice:</strong> Batch evaluation is executed with fixed thresholds in <code>agentlens.drift.detect</code>: PELT penalty <code>PEN = 0.05</code>, minimum sustained drop <code>MIN_DROP = 0.15</code>, and single-step fallback drop <code>FALLBACK_DROP = 0.20</code>. Dynamic client-side sensitivity recalibration is disabled to preserve empirical rigor and ground-truth isolation.
        </div>
      </main>
    </div>
  );
}
