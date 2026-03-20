import { useState, useEffect, useRef } from "react";
import { useTimer } from "../../hooks/useTimer";
import { useTags } from "../../hooks/useTags";
import { useSettings } from "../../hooks/useSettings";
import { eventMatchesShortcut, formatShortcut } from "../../lib/shortcuts";
import { getDefaultShortcutBindings, normalizeShortcutBindings } from "../../lib/shortcutRegistry";
import { getSelectableTags, TagSelect } from "../tags/TagSelect";
import { X } from "lucide-react";

interface StopPromptProps {
  onClose: () => void;
}

export function StopPrompt({ onClose }: StopPromptProps) {
  const { stop, discard, activeEntry } = useTimer();
  const { tags, loading: tagsLoading } = useTags();
  const { settings } = useSettings();
  const [description, setDescription] = useState("");
  const [tagId, setTagId] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const selectableTags = getSelectableTags(tags, activeEntry?.tag_id);
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const shortcutBindings = settings?.shortcut_bindings
    ? normalizeShortcutBindings(settings.shortcut_bindings)
    : getDefaultShortcutBindings();
  const stopShortcut = shortcutBindings["stop-timer"] ?? "";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (tagId || selectableTags.length === 0) return;
    setTagId(activeEntry?.tag_id ?? selectableTags[0].id);
  }, [activeEntry?.tag_id, selectableTags, tagId]);

  const handleStop = async () => {
    if (!tagId) return;
    setSaving(true);
    try {
      await stop(description, tagId);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    await discard();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (stopShortcut && eventMatchesShortcut(e.nativeEvent, stopShortcut, isMac)) {
      e.preventDefault();
      handleStop();
      return;
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
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
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
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
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleDiscard}
            className="px-3 py-1.5 rounded text-sm text-[var(--danger)] hover:bg-[var(--surface-2)] transition-colors"
          >
            Discard
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStop}
            disabled={saving || !tagId}
            className="px-4 py-1.5 rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save Entry"}
          </button>
        </div>
        {stopShortcut && (
          <p className="text-center text-[10px] text-[var(--text-muted)] mt-2">
            {formatShortcut(stopShortcut, isMac)} to save
          </p>
        )}
      </div>
    </div>
  );
}
