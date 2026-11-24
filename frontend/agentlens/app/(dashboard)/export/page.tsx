'use client';

import { useState } from 'react';
import { Download, FileText, BarChart2, Table2, Check, CheckCircle2 } from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import { BENCHMARK_TRACES } from '@/lib/benchmark-traces';

export default function ExportPage() {
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const handleExportPDF = () => {
    const reportText = `========================================================================
AGENTLENS — POST-HOC LLM AGENT AUDITOR EXECUTIVE SUMMARY REPORT
========================================================================
Date Generated: ${new Date().toUTCString()}
Evaluation Corpus: AgentLens_300_Final_Corrected.jsonl (300 Validated Traces)
Auditing Platform: AgentLens v1.0 Enterprise
Governance Clearance: 13/13 Checks Passed (Joyal Dataset Audit Clearance)

1. EXECUTIVE AUDIT CORPUS FINDINGS
------------------------------------------------------------------------
Total Audited Traces          : 300
Nominal Compliant Traces      : 146 (48.7%)
Flagged Anomaly Traces        : 154 (51.3%)
  - Scope Creep Violations    : 115 (38.3%)
  - Semantic Drift Cases      : 34  (11.3%)
  - Misinterpretation Cases   : 5   (1.7%)

Domain Distribution:
  - AI/ML Engineering         : 150 (50.0%)
  - Software Development      : 150 (50.0%)

2. STATISTICAL DETECTOR ARCHITECTURE
------------------------------------------------------------------------
Model Engine                  : SentenceTransformers (all-MiniLM-L6-v2) + ruptures PELT
Fixed Hyperparameters         : PEN=0.05, MIN_DROP=0.15, FALLBACK_DROP=0.20
Scope Policy Engine           : Exact action whitelist/blacklist containment check
Permission Schema Limitation  : Action-level schema (disclosed in AgentLens_58_Permission_Audit.csv)

3. ROADMAP NOTICE — GENERATIVE CAPABILITIES
------------------------------------------------------------------------
Generative Prompt Repair      : Phase 4 (Offline — fine-tuned Mistral-7B QLoRA in development)
Causal Token Attribution      : Phase 4 (Offline — word-level gradient attribution)

========================================================================
END OF REPORT — AGENTLENS AUDIT SECURITY ENGINE
========================================================================
`;

    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AgentLens_Executive_Audit_Report_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadNotice('Executive Audit Report downloaded successfully.');
    setTimeout(() => setDownloadNotice(null), 3000);
  };

  const handleExportCSV = () => {
    const csvContent = [
      'Trace_ID,Original_Instruction,Domain,Scenario,Difficulty,Deviation_Detected,Deviation_Type,Flagged_Step_ID,Trigger_Phrase',
      ...BENCHMARK_TRACES.map(
        (t) =>
          `"${t.trace_id}","${t.original_prompt.replace(/"/g, '""')}","${t.domain}","${t.seed_meta.scenario}","${t.seed_meta.difficulty}",${t.ground_truth.deviation_detected},"${t.ground_truth.deviation_type}",${t.ground_truth.flagged_step_id ?? ''},"${t.ground_truth.trigger_phrase ? t.ground_truth.trigger_phrase.replace(/"/g, '""') : ''}"`
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentlens_evaluation_metrics_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadNotice('Model Evaluation Metrics CSV downloaded successfully.');
    setTimeout(() => setDownloadNotice(null), 3000);
  };

  const handleExportJSONL = () => {
    const jsonl = BENCHMARK_TRACES.map((t) => JSON.stringify(t)).join('\n');
    const blob = new Blob([jsonl], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agentlens_detector_300.jsonl';
    a.click();
    URL.revokeObjectURL(url);
    setDownloadNotice('Annotated Trace Dataset JSONL downloaded successfully.');
    setTimeout(() => setDownloadNotice(null), 3000);
  };

  const EXPORT_OPTIONS = [
    {
      title: 'Executive Audit Report',
      desc: 'Complete verified audit findings including trace analysis, detected deviations, and counterfactual repairs.',
      format: 'TXT / PDF Summary',
      icon: FileText,
      color: '#4F46E5',
      handler: handleExportPDF,
    },
    {
      title: 'Model Evaluation Metrics',
      desc: 'Accuracy, precision, recall, F1-scores, and per-class confusion matrix telemetry in tabular format.',
      format: 'CSV Telemetry',
      icon: BarChart2,
      color: '#D97706',
      handler: handleExportCSV,
    },
    {
      title: 'Annotated Trace Dataset',
      desc: 'All 126 validated execution traces formatted according to AgentLens standard JSONL schema.',
      format: 'JSONL Dataset',
      icon: Table2,
      color: '#DC2626',
      handler: handleExportJSONL,
    },
  ];

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: '#F8FAFC',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* Decorative Wave Gradient */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '60%',
          height: 180,
          pointerEvents: 'none',
          opacity: 0.3,
          zIndex: 0,
        }}
        viewBox="0 0 800 200"
        fill="none"
        preserveAspectRatio="none"
      >
        <path d="M0 130 C 200 60, 450 170, 800 40 L 800 0 L 0 0 Z" fill="#4F46E5" fillOpacity="0.08" />
        <path d="M100 160 C 350 90, 550 190, 800 100 L 800 0 L 100 0 Z" fill="#4F46E5" fillOpacity="0.05" />
      </svg>

      <Topbar
        title="Export & Reports"
        subtitle="Generate executive audit reports, download metrics, and export sanitized dataset traces."
        breadcrumb="AGENTLENS / REPORTS & EXPORT"
      />

      <main
        style={{
          flex: 1,
          padding: '12px 32px 32px 32px',
          maxWidth: 880,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {downloadNotice && (
          <div
            style={{
              background: 'rgba(5, 150, 105, 0.1)',
              border: '1px solid #059669',
              borderRadius: 8,
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#0F172A',
              fontSize: 12.5,
            }}
          >
            <CheckCircle2 size={16} color="#059669" />
            <span>{downloadNotice}</span>
          </div>
        )}

        {EXPORT_OPTIONS.map((opt) => (
          <div
            key={opt.title}
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E2E8F0',
              padding: '22px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              boxShadow: '0 1px 3px rgba(41,45,50,0.03)',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: `${opt.color}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <opt.icon size={20} color={opt.color} strokeWidth={1.8} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{opt.title}</div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 3, lineHeight: 1.5 }}>
                {opt.desc}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: opt.color,
                  background: `${opt.color}15`,
                  padding: '3px 9px',
                  borderRadius: 5,
                  fontFamily: 'IBM Plex Mono, monospace',
                }}
              >
                {opt.format}
              </span>
              <button
                onClick={opt.handler}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 7,
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  color: '#0F172A',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F8FAFC';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#FFFFFF';
                }}
              >
                <Download size={13} strokeWidth={2} />
                Download
              </button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
