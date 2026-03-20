import { useState, useEffect, useRef } from "react";
import { useTimer } from "../../hooks/useTimer";
import { useTags } from "../../hooks/useTags";
import { deleteEntry, type TimeEntry, updateEntry } from "../../lib/commands";
import { getSelectableTags, TagSelect } from "../tags/TagSelect";
import { AlertCircle, LoaderCircle, X } from "lucide-react";

interface StopPromptProps {
  onClose: () => void;
}

export function StopPrompt({ onClose }: StopPromptProps) {
  const { activeEntry, recover, stopEntry } = useTimer();
  const { tags, loading: tagsLoading } = useTags();
  const [description, setDescription] = useState("");
  const [tagId, setTagId] = useState("");
  const [draftEntry, setDraftEntry] = useState<TimeEntry | null>(null);
  const [stopping, setStopping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState("");
  const initializedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentTagId = draftEntry?.tag_id ?? activeEntry?.tag_id;
  const selectableTags = getSelectableTags(tags, currentTagId);
  const isBusy = stopping || saving || discarding;

  useEffect(() => {
    if (!draftEntry || stopping) return;
    inputRef.current?.focus();
  }, [draftEntry, stopping]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let cancelled = false;

    const finalizeTimer = async () => {
      setStopping(true);
      setError("");
      try {
        const runningEntry = await recover();
        if (!runningEntry) {
          if (!cancelled) onClose();
          return;
        }

        const stoppedEntry = await stopEntry(runningEntry.id);
        if (cancelled) return;

        setDraftEntry(stoppedEntry);
        setDescription(stoppedEntry.description);
        setTagId(stoppedEntry.tag_id ?? "");
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
        }
      } finally {
        if (!cancelled) {
          setStopping(false);
        }
      }
    };

    void finalizeTimer();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tagId || selectableTags.length === 0) return;
    setTagId(currentTagId ?? selectableTags[0].id);
  }, [currentTagId, selectableTags, tagId]);

  const handleStop = async () => {
    if (!draftEntry || !tagId) return;
    setSaving(true);
    setError("");
    try {
      await updateEntry({
        id: draftEntry.id,
        description,
        tag_id: tagId,
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (!draftEntry) return;
    setDiscarding(true);
    setError("");
    try {
      await deleteEntry(draftEntry.id);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setDiscarding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isBusy) return;
    if (e.key === "Escape") {
      onClose();
    }
  };

  const handleClose = () => {
    if (!isBusy) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className="bg-[var(--surface-1)] border border-[var(--border-strong)] rounded w-full max-w-lg p-5 shadow-2xl animate-slide-up"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Stop Timer
          </h2>
          <button
            onClick={handleClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
            disabled={isBusy}
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
          {stopping && (
            <div className="flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              <LoaderCircle size={14} className="animate-spin" />
              Stopping timer…
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              What did you work on?
            </label>
            <textarea
              ref={inputRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Implemented login flow, fixed bug #42…"
              rows={4}
              disabled={isBusy || !draftEntry}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-muted)] transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Tag
            </label>
            <TagSelect
              tags={selectableTags}
              value={tagId}
              onChange={setTagId}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
            />
            {!tagsLoading && selectableTags.length === 0 && (
              <p className="mt-1.5 text-xs text-[var(--danger)]">
                Create at least one active tag before saving entries.
              </p>
            )}
          </div>

          {draftEntry?.end_time && (
            <p className="text-xs text-[var(--text-muted)]">
              Timer stopped at {draftEntry.end_time.slice(0, 5)}.
            </p>
          )}

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--danger)]">
              <AlertCircle size={13} />
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleDiscard}
            disabled={isBusy || !draftEntry}
            className="px-3 py-1.5 rounded text-sm text-[var(--danger)] hover:bg-[var(--surface-2)] disabled:opacity-50 transition-colors"
          >
            {discarding ? "Discarding…" : "Discard"}
          </button>
          <div className="flex-1" />
          <button
            onClick={handleClose}
            disabled={isBusy}
            className="px-3 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)] disabled:opacity-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleStop}
            disabled={isBusy || !draftEntry || !tagId}
            className="px-4 py-1.5 rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save Entry"}
          </button>
        </div>
      </div>
    </div>
  );
}
