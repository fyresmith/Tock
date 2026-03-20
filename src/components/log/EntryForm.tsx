import { useState, useEffect, useRef } from "react";
import { CreateEntryArgs } from "../../lib/commands";
import { useTags } from "../../hooks/useTags";
import { useClients } from "../../hooks/useClients";
import { today } from "../../lib/dateUtils";
import { getSelectableTags, TagSelect } from "../tags/TagSelect";
import { DatePicker } from "../ui/DatePicker";
import { TimePicker, TimePickerHandle } from "../ui/TimePicker";
import { X, AlertCircle } from "lucide-react";
import { Select } from "../ui/Select";

interface EntryFormProps {
  onAdd: (args: CreateEntryArgs) => Promise<void>;
  onClose: () => void;
}

export function EntryForm({ onAdd, onClose }: EntryFormProps) {
  const { tags } = useTags();
  const { activeClients, defaultClient } = useClients();
  const endTimeRef = useRef<TimePickerHandle>(null);
  const [form, setForm] = useState<CreateEntryArgs>({
    date: today(),
    start_time: "",
    end_time: "",
    description: "",
    tag_id: "",
    client_id: null,
  });
  const [billable, setBillable] = useState(true);
  const [rateOverride, setRateOverride] = useState<number | null>(null);

  // Pre-select default client once clients load
  useEffect(() => {
    if (form.client_id === null && defaultClient) {
      setForm((f) => ({ ...f, client_id: defaultClient.id }));
    }
  }, [defaultClient, form.client_id]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectableTags = getSelectableTags(tags);

  useEffect(() => {
    if (form.tag_id || selectableTags.length === 0) return;
    setForm((current) => ({ ...current, tag_id: selectableTags[0].id }));
  }, [form.tag_id, selectableTags]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.start_time || !form.end_time) {
      setError("Start and end times are required");
      return;
    }
    if (!form.tag_id) {
      setError("Choose a tag");
      return;
    }
    if (form.start_time >= form.end_time) {
      setError("End time must be after start time");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onAdd({
        ...form,
        start_time: form.start_time + ":00",
        end_time: form.end_time + ":00",
        billable,
        hourly_rate: rateOverride,
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-[var(--surface-1)] border border-[var(--border-strong)] rounded w-full max-w-md p-6 shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Add Manual Entry
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Date
            </label>
            <DatePicker
              value={form.date}
              onChange={(date) => setForm({ ...form, date })}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Start time
              </label>
              <TimePicker
                value={form.start_time}
                onChange={(t) => setForm({ ...form, start_time: t })}
                onComplete={() => endTimeRef.current?.focus()}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                End time
              </label>
              <TimePicker
                ref={endTimeRef}
                value={form.end_time}
                onChange={(t) => setForm({ ...form, end_time: t })}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What did you work on?"
              rows={2}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:border-[var(--brand)] focus:outline-none"
            />
          </div>

          {activeClients.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Client
              </label>
              <Select
                value={form.client_id ?? ""}
                onChange={(v) => setForm({ ...form, client_id: v || null })}
                options={[
                  { value: "", label: "No client" },
                  ...activeClients.map((c) => ({ value: c.id, label: c.name })),
                ]}
                className="w-full bg-[var(--surface-2)] border border-[var(--border-strong)] rounded px-3 py-2 text-sm font-medium text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Tag
            </label>
            <TagSelect
              tags={selectableTags}
              value={form.tag_id}
              onChange={(tag_id) => setForm({ ...form, tag_id })}
              className="w-full bg-[var(--surface-2)] border border-[var(--border-strong)] rounded px-3 py-2 text-sm font-medium text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={billable}
                onChange={(e) => setBillable(e.target.checked)}
              />
              Billable
            </label>
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)]">Rate override</label>
              <input
                type="number"
                placeholder="Use default"
                value={rateOverride ?? ""}
                onChange={(e) => setRateOverride(e.target.value ? Number(e.target.value) : null)}
                className="w-28 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--danger)]">
              <AlertCircle size={13} />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? "Adding…" : "Add Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
