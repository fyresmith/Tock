import { useEffect, useState } from "react";
import { useTimer } from "../../hooks/useTimer";
import { useClients } from "../../hooks/useClients";
import { useTags } from "../../hooks/useTags";
import { elapsedSeconds, secondsToHHMMSS, formatTime } from "../../lib/dateUtils";
import { getSelectableTags, TagSelect } from "../tags/TagSelect";
import { Play, Square, Check, X } from "lucide-react";

export function PopupTimerView() {
  const { activeEntry, isRunning, start, stop, discard, recover } = useTimer();
  const { activeClients, defaultClient } = useClients();
  const { tags } = useTags();
  const [elapsed, setElapsed] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [description, setDescription] = useState("");
  const [tagId, setTagId] = useState("");
  const [saving, setSaving] = useState(false);

  const selectableTags = getSelectableTags(tags, activeEntry?.tag_id);

  useEffect(() => {
    if (selectedClientId === null && defaultClient) {
      setSelectedClientId(defaultClient.id);
    }
  }, [defaultClient, selectedClientId]);

  useEffect(() => {
    setRecovering(true);
    recover().finally(() => setRecovering(false));
  }, []);

  useEffect(() => {
    if (tagId || selectableTags.length === 0) return;
    setTagId(activeEntry?.tag_id ?? selectableTags[0]?.id ?? "");
  }, [activeEntry?.tag_id, selectableTags, tagId]);

  useEffect(() => {
    if (!isRunning || !activeEntry) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(elapsedSeconds(activeEntry.start_time, activeEntry.date));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning, activeEntry]);

  const handleStop = async () => {
    if (!tagId) return;
    setSaving(true);
    try {
      await stop(description, tagId);
      setStopping(false);
      setDescription("");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    await discard();
    setStopping(false);
    setDescription("");
  };

  const clientName = activeEntry?.client_id
    ? activeClients.find((c) => c.id === activeEntry.client_id)?.name
    : null;

  if (recovering) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-[var(--text-muted)]">Loading…</p>
      </div>
    );
  }

  // ── Stop form ──
  if (stopping) {
    return (
      <div className="flex flex-col h-full p-3 gap-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-[var(--text-primary)]">Stop Timer</span>
          <button
            onClick={() => setStopping(false)}
            className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What did you work on?"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleStop();
            if (e.key === "Escape") setStopping(false);
          }}
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:outline-none"
        />

        <TagSelect
          tags={selectableTags}
          value={tagId}
          onChange={setTagId}
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
        />

        <div className="flex gap-1.5 mt-auto">
          <button
            onClick={handleDiscard}
            className="px-2 py-1.5 rounded text-xs text-[var(--danger)] hover:bg-[var(--surface-2)] transition-colors"
          >
            Discard
          </button>
          <div className="flex-1" />
          <button
            onClick={handleStop}
            disabled={saving || !tagId}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-medium disabled:opacity-50 transition-colors"
          >
            <Check size={11} />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  // ── Main timer view ──
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
      {/* Status badge */}
      <div className="flex items-center gap-1.5">
        {isRunning ? (
          <>
            <span
              className="w-1.5 h-1.5 rounded-full bg-[var(--brand)]"
              style={{ animation: "pulse-dot 1.5s ease-in-out infinite" }}
            />
            <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--brand)]">
              Recording
            </span>
          </>
        ) : (
          <span className="text-[10px] text-[var(--text-muted)] tracking-widest uppercase">
            Ready
          </span>
        )}
      </div>

      {/* Clock */}
      <div className="text-center">
        <div
          className="font-mono font-bold tabular-nums text-[var(--text-primary)]"
          style={{ fontSize: "3.5rem", letterSpacing: "-0.04em", lineHeight: 1 }}
        >
          {secondsToHHMMSS(elapsed)}
        </div>
        {activeEntry && (
          <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
            {formatTime(activeEntry.start_time)}
            {clientName ? ` · ${clientName}` : ""}
          </p>
        )}
      </div>

      {/* Client selector (not running) */}
      {!isRunning && activeClients.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--text-muted)]">Client</label>
          <select
            value={selectedClientId ?? ""}
            onChange={(e) => setSelectedClientId(e.target.value || null)}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
          >
            <option value="">No client</option>
            {activeClients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Button */}
      {!isRunning ? (
        <button
          onClick={() => start(selectedClientId)}
          className="flex items-center gap-2 px-5 py-2 rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-medium text-sm transition-colors"
        >
          <Play size={13} fill="currentColor" />
          Start
        </button>
      ) : (
        <button
          onClick={() => setStopping(true)}
          className="flex items-center gap-2 px-5 py-2 rounded bg-[var(--surface-2)] border border-[var(--border-strong)] text-[var(--text-primary)] font-medium text-sm transition-colors hover:bg-[var(--surface-3)]"
        >
          <Square size={13} fill="currentColor" />
          Stop
        </button>
      )}
    </div>
  );
}
