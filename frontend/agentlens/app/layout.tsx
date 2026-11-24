import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentLens — LLM Agent Trace Auditor',
  description:
    'Post-hoc AI agent trace auditor and prompt repair engine. Visualize execution flows, pinpoint failure steps, and generate surgical prompt rewrites.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, fontFamily: 'Inter, sans-serif', background: 'var(--bg-main, #F8FAFC)' }}>
        {children}
      </body>
    </html>
  );
}
