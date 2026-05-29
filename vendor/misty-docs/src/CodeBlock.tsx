import { useState } from "react";

export default function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-[rgba(9,9,11,0.6)]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[rgba(17,17,19,0.5)]">
        <span className="text-xs font-medium text-text-muted">{label}</span>
        <button onClick={copy} className="text-xs text-text-muted hover:text-text transition-colors cursor-pointer">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all p-4 font-mono text-[16.5px] leading-relaxed text-text-secondary">
        {code}
      </pre>
    </div>
  );
}
