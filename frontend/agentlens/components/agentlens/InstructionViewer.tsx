interface InstructionViewerProps {
  instruction: string;
}

export function InstructionViewer({ instruction }: InstructionViewerProps) {
  return <div className="rounded-lg border border-slate-200 bg-[#FAF9F6] px-3.5 py-3">
    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Original instruction</h3>
    <p className="break-words text-sm leading-6 text-slate-800">{instruction || "No instruction provided"}</p>
  </div>;
}
