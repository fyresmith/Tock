const MODIFIER_ALIASES: Record<string, "mod" | "shift" | "alt" | "ctrl" | "meta"> = {
  mod: "mod",
  cmd: "meta",
  command: "meta",
  meta: "meta",
  ctrl: "ctrl",
  control: "ctrl",
  shift: "shift",
  alt: "alt",
  option: "alt",
};

const MODIFIER_ORDER = ["mod", "meta", "ctrl", "shift", "alt"] as const;

function normalizeShortcutKey(key: string): string {
  const trimmed = key.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed === " ") return "space";
  if (trimmed === "spacebar") return "space";
  if (trimmed === "escape") return "esc";
  if (trimmed === "return") return "enter";
  return trimmed;
}

function normalizeEventKey(event: KeyboardEvent): string {
  if (event.code === "Space") return "space";
  return normalizeShortcutKey(event.key);
}

function parseShortcut(shortcut?: string | null): { modifiers: Set<string>; key: string } {
  const modifiers = new Set<string>();
  let key = "";

  for (const rawPart of (shortcut ?? "").split("+")) {
    const normalized = normalizeShortcutKey(rawPart);
    if (!normalized) continue;
    const modifier = MODIFIER_ALIASES[normalized];
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }
    key = normalized;
  }

  return { modifiers, key };
}

export function normalizeShortcut(shortcut?: string | null): string {
  const { modifiers, key } = parseShortcut(shortcut);
  const parts: string[] = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier));
  if (key) parts.push(key);
  return parts.join("+");
}

export function formatShortcut(shortcut: string | null | undefined, isMac: boolean): string {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) return "Not set";

  const tokens = normalized.split("+");
  const labels = tokens.map((token) => {
    switch (token) {
      case "mod":
        return isMac ? "Cmd" : "Ctrl";
      case "meta":
        return "Cmd";
      case "ctrl":
        return "Ctrl";
      case "shift":
        return "Shift";
      case "alt":
        return isMac ? "Option" : "Alt";
      case "space":
        return "Space";
      case "esc":
        return "Esc";
      case "arrowup":
        return "Up";
      case "arrowdown":
        return "Down";
      case "arrowleft":
        return "Left";
      case "arrowright":
        return "Right";
      default:
        return token.length === 1 ? token.toUpperCase() : token[0].toUpperCase() + token.slice(1);
    }
  });

  return labels.join(" + ");
}

export function eventMatchesShortcut(
  event: KeyboardEvent,
  shortcut: string | null | undefined,
  isMac: boolean,
): boolean {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) return false;

  const { modifiers, key } = parseShortcut(normalized);
  const eventKey = normalizeEventKey(event);
  if (!key || eventKey !== key) {
    return false;
  }

  const expectedMeta = modifiers.has("meta");
  const expectedCtrl = modifiers.has("ctrl");
  const expectedShift = modifiers.has("shift");
  const expectedAlt = modifiers.has("alt");
  const expectedMod = modifiers.has("mod");
  const expectedMetaKey = expectedMeta || (expectedMod && isMac);
  const expectedCtrlKey = expectedCtrl || (expectedMod && !isMac);

  return (
    event.metaKey === expectedMetaKey &&
    event.ctrlKey === expectedCtrlKey &&
    event.shiftKey === expectedShift &&
    event.altKey === expectedAlt
  );
}

export function shortcutFromEvent(event: KeyboardEvent, isMac: boolean): string | null {
  const key = normalizeEventKey(event);
  if (!key || MODIFIER_ALIASES[key]) {
    return null;
  }

  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) {
    parts.push("mod");
  }
  if (event.shiftKey) {
    parts.push("shift");
  }
  if (event.altKey) {
    parts.push("alt");
  }
  if (!parts.includes("mod") && event.ctrlKey && isMac) {
    parts.push("ctrl");
  }
  if (!parts.includes("mod") && event.metaKey && !isMac) {
    parts.push("meta");
  }
  parts.push(key);

  return normalizeShortcut(parts.join("+"));
}

export function shortcutHasModifier(shortcut: string | null | undefined): boolean {
  return parseShortcut(shortcut).modifiers.size > 0;
}

export function isSpaceShortcut(shortcut: string | null | undefined): boolean {
  return normalizeShortcut(shortcut) === "space";
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  return target.isContentEditable;
}
