import { ScanSearch } from "lucide-react";

export function Header() {
  return <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 backdrop-blur">
    <div className="mx-auto flex h-[68px] w-full max-w-[1800px] items-center justify-between px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm"><ScanSearch className="h-[18px] w-[18px]" strokeWidth={2.1} /></span>
        <span className="min-w-0"><span className="block text-[15px] font-semibold leading-5 tracking-tight text-slate-900">AgentLens</span><span className="hidden text-[11px] leading-4 text-slate-500 sm:block">AI agent trace auditor</span></span>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 sm:px-3 sm:text-xs"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" /><span className="hidden sm:inline">Trace review</span><span>V1 workspace</span></div>
    </div>
  </header>;
}
