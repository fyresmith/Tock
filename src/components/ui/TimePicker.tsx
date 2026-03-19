import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Clock } from "lucide-react";

interface TimePickerProps {
  value: string;          // "HH:MM" 24h, or ""
  onChange: (value: string) => void;
  onComplete?: () => void; // called when AM/PM segment is confirmed
}

export interface TimePickerHandle {
  focus: () => void;
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

function parse(raw: string): { h: string; m: string; ampm: "AM" | "PM" } {
  if (!raw || !raw.includes(":")) return { h: "", m: "", ampm: "AM" };
  const [hStr, mStr] = raw.split(":");
  const h24 = parseInt(hStr, 10);
  if (isNaN(h24)) return { h: "", m: mStr ?? "", ampm: "AM" };
  const ampm: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return { h: String(h12), m: mStr ?? "", ampm };
}

function to24h(h: string, m: string, ampm: "AM" | "PM"): string {
  const hNum = parseInt(h, 10);
  const mNum = parseInt(m, 10);
  if (!h || !m || isNaN(hNum) || isNaN(mNum)) return "";
  let hour = hNum;
  if (ampm === "AM") { if (hour === 12) hour = 0; }
  else               { if (hour !== 12) hour += 12; }
  return `${String(hour).padStart(2, "0")}:${String(mNum).padStart(2, "0")}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const TimePicker = forwardRef<TimePickerHandle, TimePickerProps>(
  function TimePicker({ value, onChange, onComplete }, ref) {
    const { h: initH, m: initM, ampm: initAmpm } = parse(value);
    const [h, setH] = useState(initH);
    const [m, setM] = useState(initM);
    const [ampm, setAmpm] = useState<"AM" | "PM">(initAmpm);
    const [focused, setFocused] = useState(false);

    const hourRef = useRef<HTMLInputElement>(null);
    const minRef  = useRef<HTMLInputElement>(null);
    const ampmRef = useRef<HTMLButtonElement>(null);

    useImperativeHandle(ref, () => ({
      focus() {
        hourRef.current?.focus();
        hourRef.current?.select();
      },
    }));

    // Sync from external value changes (e.g. form reset)
    useEffect(() => {
      const p = parse(value);
      setH(p.h);
      setM(p.m);
      setAmpm(p.ampm);
    }, [value]);

    const emit = (nh: string, nm: string, na: "AM" | "PM") => {
      const result = to24h(nh, nm, na);
      if (result) onChange(result);
    };

    const focusMin = () => { minRef.current?.focus(); minRef.current?.select(); };
    const focusAmpm = () => { ampmRef.current?.focus(); };

    // ── Hour ────────────────────────────────────────────────────────────────

    const handleHourKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Tab") return;

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const cur = parseInt(h) || 12;
        const next = e.key === "ArrowUp"
          ? (cur >= 12 ? 1 : cur + 1)
          : (cur <= 1  ? 12 : cur - 1);
        setH(String(next));
        emit(String(next), m, ampm);
        return;
      }

      if (e.key === "Backspace") { e.preventDefault(); setH(""); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); focusMin(); return; }
      if (!/^\d$/.test(e.key)) return;
      e.preventDefault();

      const digit = parseInt(e.key);

      if (!h || h.length >= 2) {
        // Start fresh
        if (digit === 0) { setH("12"); emit("12", m, ampm); focusMin(); return; }
        setH(String(digit));
        if (digit >= 2) { emit(String(digit), m, ampm); focusMin(); }
      } else {
        // h is one digit — try combining
        const combined = parseInt(h + e.key);
        if (combined >= 1 && combined <= 12) {
          setH(String(combined));
          emit(String(combined), m, ampm);
          focusMin();
        } else {
          // Invalid combo (e.g. "1"+"4"→14): start fresh with new digit
          if (digit === 0) { setH("12"); emit("12", m, ampm); focusMin(); }
          else { setH(String(digit)); if (digit >= 2) { emit(String(digit), m, ampm); focusMin(); } }
        }
      }
    };

    // ── Minute ──────────────────────────────────────────────────────────────

    const handleMinKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Tab") return;

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const cur = parseInt(m) || 0;
        const next = e.key === "ArrowUp"
          ? (cur >= 59 ? 0  : cur + 1)
          : (cur <= 0  ? 59 : cur - 1);
        const nm = String(next).padStart(2, "0");
        setM(nm); emit(h, nm, ampm);
        return;
      }

      if (e.key === "Backspace") {
        e.preventDefault();
        if (m === "") { hourRef.current?.focus(); hourRef.current?.select(); }
        else setM("");
        return;
      }
      if (e.key === "ArrowLeft")  { e.preventDefault(); hourRef.current?.focus(); hourRef.current?.select(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); focusAmpm(); return; }
      if (!/^\d$/.test(e.key)) return;
      e.preventDefault();

      const digit = parseInt(e.key);

      if (!m || m.length >= 2) {
        setM(String(digit));
        // single digit — wait for second
      } else {
        const combined = m + e.key;
        const num = parseInt(combined);
        if (num <= 59) {
          setM(combined);
          emit(h, combined, ampm);
          focusAmpm();
        } else {
          // Invalid combo — restart with new digit
          setM(String(digit));
        }
      }
    };

    // ── AM/PM ───────────────────────────────────────────────────────────────

    const setAndComplete = (na: "AM" | "PM") => {
      setAmpm(na);
      emit(h, m, na);
      onComplete?.();
    };

    const handleAmpmKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "a" || e.key === "A") { e.preventDefault(); setAndComplete("AM"); }
      if (e.key === "p" || e.key === "P") { e.preventDefault(); setAndComplete("PM"); }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setAndComplete(ampm === "AM" ? "PM" : "AM");
      }
      if (e.key === "Backspace" || e.key === "ArrowLeft") {
        e.preventDefault(); minRef.current?.focus(); minRef.current?.select();
      }
    };

    const displayM = m.length === 2 ? m : m.length === 1 ? `${m}` : "";

    return (
      <div
        className={`flex items-center rounded border bg-[var(--surface-1)] px-2.5 py-2 transition-colors ${
          focused
            ? "border-[var(--brand)]"
            : "border-[var(--border)] hover:border-[var(--border-strong)]"
        }`}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
        }}
      >
        <Clock size={13} className="text-[var(--text-muted)] mr-2 flex-shrink-0" />

        {/* Hour */}
        <input
          ref={hourRef}
          type="text"
          inputMode="numeric"
          value={h}
          onChange={() => {}}
          onKeyDown={handleHourKey}
          onFocus={(e) => e.target.select()}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          placeholder="--"
          className="w-5 bg-transparent text-center text-sm font-mono tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none caret-transparent"
        />

        <span className="text-[var(--text-muted)] text-sm font-mono select-none mx-0.5">:</span>

        {/* Minute */}
        <input
          ref={minRef}
          type="text"
          inputMode="numeric"
          value={displayM}
          onChange={() => {}}
          onKeyDown={handleMinKey}
          onFocus={(e) => e.target.select()}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          placeholder="--"
          className="w-5 bg-transparent text-center text-sm font-mono tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none caret-transparent"
        />

        {/* AM/PM */}
        <button
          ref={ampmRef}
          type="button"
          onKeyDown={handleAmpmKey}
          onClick={() => setAndComplete(ampm === "AM" ? "PM" : "AM")}
          className="ml-2 text-[11px] font-semibold text-[var(--brand)] hover:opacity-75 transition-opacity outline-none select-none w-7 text-left"
        >
          {ampm}
        </button>
      </div>
    );
  }
);
