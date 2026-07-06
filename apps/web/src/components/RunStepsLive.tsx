"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "./ui";

interface StepView {
  id: string;
  seq: number;
  stepType: string;
  status: string;
  title: string;
  input: unknown;
  output: unknown;
  error: string | null;
  durationMs: number | null;
  costCents: number;
}

interface RunView {
  status: string;
  statusReason: string | null;
  costCents: number;
  steps: StepView[];
  artifacts: { id: string; title: string; content: string | null }[];
}

// Streams run progress over SSE (Spec: steps visible <1s after completion).
export function RunStepsLive({
  streamUrl,
  initial,
}: {
  streamUrl: string;
  initial: RunView;
}) {
  const [view, setView] = useState<RunView>(initial);

  useEffect(() => {
    const terminal = ["succeeded", "failed", "cancelled", "blocked"];
    if (terminal.includes(initial.status)) return;
    const es = new EventSource(streamUrl);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as RunView;
        setView(data);
        if (terminal.includes(data.status)) es.close();
      } catch {
        // ignore malformed frames
      }
    };
    es.onerror = () => {
      // Server closed (terminal) or transient error; EventSource auto-retries.
    };
    return () => es.close();
  }, [streamUrl, initial.status]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <StatusBadge status={view.status} />
        {view.statusReason && <p className="text-sm text-slate-500">{view.statusReason}</p>}
        {view.costCents > 0 && (
          <p className="text-sm text-slate-400">cost ${(view.costCents / 100).toFixed(2)}</p>
        )}
      </div>

      <ol className="relative space-y-3 border-l border-slate-200 pl-6">
        {view.steps.map((s) => (
          <li key={s.id} className="relative">
            <span
              className={`absolute -left-[1.85rem] top-1.5 h-3 w-3 rounded-full border-2 border-white ${
                s.status === "succeeded"
                  ? "bg-emerald-500"
                  : s.status === "failed"
                    ? "bg-red-500"
                    : s.status === "waiting"
                      ? "bg-amber-400"
                      : "bg-blue-400"
              }`}
            />
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">
                  <span className="mr-2 text-xs uppercase text-slate-400">{s.stepType}</span>
                  {s.title}
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {s.durationMs !== null && <span>{s.durationMs}ms</span>}
                  <StatusBadge status={s.status} />
                </div>
              </div>
              {s.error && <p className="mt-1 text-sm text-red-600">{s.error}</p>}
              {s.output !== null && s.output !== undefined && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                    details
                  </summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-600">
                    {JSON.stringify(s.output, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </li>
        ))}
        {view.steps.length === 0 && (
          <li className="text-sm text-slate-400">Waiting for the engine to pick up this run…</li>
        )}
      </ol>

      {view.artifacts.length > 0 && (
        <div>
          <h3 className="mb-2 font-medium text-slate-900">Output</h3>
          {view.artifacts.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm font-medium text-slate-700">{a.title}</p>
              <pre className="whitespace-pre-wrap text-sm text-slate-700">{a.content}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
