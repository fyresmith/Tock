import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  placeholder?: string;
}

export function Select({ value, onChange, options, className = "", placeholder }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const openDropdown = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const itemHeight = 30;
    const dropdownHeight = Math.min(options.length * itemHeight + 8, 240);
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow < dropdownHeight && rect.top > dropdownHeight
        ? rect.top - dropdownHeight - 2
        : rect.bottom + 2;
    setDropdownStyle({
      position: "fixed",
      top,
      left: rect.left,
      width: Math.max(rect.width, 140),
      zIndex: 9999,
    });
    const idx = options.findIndex((o) => o.value === value);
    setFocusedIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  }, [options, value]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
  }, []);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    closeDropdown();
    buttonRef.current?.focus();
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!buttonRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeDropdown]);

  // Scroll focused item into view
  useEffect(() => {
    if (!open || !dropdownRef.current) return;
    const items = dropdownRef.current.querySelectorAll<HTMLElement>("[data-option]");
    items[focusedIndex]?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        closeDropdown();
        break;
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          handleSelect(options[focusedIndex].value);
        }
        break;
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? closeDropdown() : openDropdown())}
        onKeyDown={handleKeyDown}
        className={`flex items-center justify-between gap-1.5 text-left cursor-pointer ${className}`}
      >
        <span className="truncate">
          {selected ? (
            selected.label
          ) : (
            <span className="text-[var(--text-muted)]">{placeholder ?? "Select…"}</span>
          )}
        </span>
        <ChevronDown
          size={12}
          className={`flex-shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-md shadow-2xl py-1 overflow-auto max-h-60"
          >
            {options.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                data-option
                onClick={() => handleSelect(opt.value)}
                onMouseEnter={() => setFocusedIndex(i)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  i === focusedIndex ? "bg-[var(--surface-3)]" : ""
                } ${opt.value === value ? "text-[var(--brand)] font-medium" : "text-[var(--text-primary)]"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
