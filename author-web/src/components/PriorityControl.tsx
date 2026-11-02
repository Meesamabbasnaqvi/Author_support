import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown } from "lucide-react";
import type { Priority } from "../api/types";
import { priorityDot, priorityLabel, priorityOptions } from "../lib/labels";
import { PriorityBadge } from "./ui";

interface Props {
  value: Priority;
  overridden: boolean;
  onChange: (p: Priority) => void;
  disabled?: boolean;
}

// Shows the current priority. "Raise" moves it up one level. The chevron opens the full list.
export function PriorityControl({ value, overridden, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const index = priorityOptions.indexOf(value);
  const higher = index > 0 ? priorityOptions[index - 1] : null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrap} className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 transition-colors hover:bg-canvas disabled:opacity-50"
      >
        <PriorityBadge value={value} />
        <ChevronDown className="h-3.5 w-3.5 text-subtle" aria-hidden />
      </button>

      {higher && (
        <button
          type="button"
          onClick={() => onChange(higher)}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
          title={`Raise to ${priorityLabel[higher]}`}
        >
          <ArrowUp className="h-3.5 w-3.5" aria-hidden /> Raise
        </button>
      )}

      {overridden && <span className="text-xs text-muted">Changed by you</span>}

      {open && (
        <ul role="listbox" className="absolute left-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          {priorityOptions.map((p) => (
            <li key={p}>
              <button
                type="button"
                role="option"
                aria-selected={p === value}
                onClick={() => {
                  setOpen(false);
                  if (p !== value) onChange(p);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-canvas"
              >
                <span className={`h-2 w-2 rounded-full ${priorityDot[p]}`} aria-hidden />
                <span className="flex-1">{priorityLabel[p]}</span>
                {p === value && <span className="text-xs text-muted">Current</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
