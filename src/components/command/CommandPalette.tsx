import { useEffect, useMemo, useRef, useState } from "react";
import { Search, type LucideIcon } from "lucide-react";
import { formatShortcut } from "../../lib/shortcuts";

export interface CommandPaletteAction {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  group: string;
  icon: LucideIcon;
  shortcut?: string;
  perform: () => void | Promise<void>;
}

interface CommandPaletteProps {
  open: boolean;
  actions: CommandPaletteAction[];
  isMac: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, actions, isMac, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }

    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const filteredActions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter((action) => {
      const haystack = [
        action.title,
        action.subtitle ?? "",
        action.group,
        ...(action.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [actions, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (activeIndex < filteredActions.length) return;
    setActiveIndex(Math.max(0, filteredActions.length - 1));
  }, [activeIndex, filteredActions.length]);

  if (!open) {
    return null;
  }

  const runAction = async (action: CommandPaletteAction) => {
    await action.perform();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/55 backdrop-blur-[1px] flex items-start justify-center px-4 pt-20"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search size={16} className="text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) =>
                  filteredActions.length === 0 ? 0 : Math.min(filteredActions.length - 1, current + 1)
                );
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => Math.max(0, current - 1));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const action = filteredActions[activeIndex];
                if (action) {
                  void runAction(action);
                }
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="Search actions, views, or settings…"
            className="flex-1 bg-transparent text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <span className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[10px] font-medium tracking-[0.12em] uppercase text-[var(--text-muted)]">
            {isMac ? "Esc" : "Escape"}
          </span>
        </div>

        <div className="max-h-[26rem] overflow-auto p-2">
          {filteredActions.length === 0 ? (
            <div className="rounded border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-8 text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">No matching actions</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Try a broader search like “invoice”, “log”, or “timer”.
              </p>
            </div>
          ) : (
            filteredActions.map((action, index) => {
              const Icon = action.icon;
              const active = index === activeIndex;
              const showGroup = index === 0 || filteredActions[index - 1]?.group !== action.group;
              return (
                <div key={action.id}>
                  {showGroup && (
                    <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--text-muted)]">
                      {action.group}
                    </p>
                  )}
                  <button
                    onClick={() => void runAction(action)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`w-full rounded border px-3 py-3 text-left transition-colors ${
                      active
                        ? "border-[var(--brand-muted-border)] bg-[var(--brand-muted)]"
                        : "border-transparent hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] p-2 text-[var(--text-secondary)]">
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                              {action.title}
                            </p>
                            {action.subtitle && (
                              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                                {action.subtitle}
                              </p>
                            )}
                          </div>
                          {action.shortcut && (
                            <span className="shrink-0 rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)]">
                              {formatShortcut(action.shortcut, isMac)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
