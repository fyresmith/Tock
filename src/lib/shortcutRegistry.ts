import {
  ClipboardList,
  FileText,
  Keyboard,
  LayoutDashboard,
  PlusCircle,
  Settings2,
  Square,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { normalizeShortcut } from "./shortcuts";

export type ShortcutActionId =
  | "open-command-palette"
  | "toggle-timer"
  | "open-manual-entry"
  | "go-to-timer"
  | "go-to-log"
  | "go-to-dashboard"
  | "go-to-invoices"
  | "go-to-settings"
  | "open-shortcuts-settings";

export type ShortcutBindings = Partial<Record<ShortcutActionId, string>>;

export interface ShortcutDefinition {
  id: ShortcutActionId;
  title: string;
  description: string;
  group: "General" | "Timer" | "Entries" | "Navigation" | "Settings";
  defaultShortcut: string | null;
  allowModifierless?: boolean;
  firesWhileEditing?: boolean;
  icon: LucideIcon;
  keywords?: string[];
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: "open-command-palette",
    title: "Open Command Palette",
    description: "Open the searchable action palette from anywhere in the app.",
    group: "General",
    defaultShortcut: "mod+k",
    firesWhileEditing: true,
    icon: Keyboard,
    keywords: ["actions", "search", "launcher"],
  },
  {
    id: "toggle-timer",
    title: "Toggle Timer",
    description: "Start the timer when idle, or open the stop prompt when a timer is running.",
    group: "Timer",
    defaultShortcut: "space",
    allowModifierless: true,
    icon: Timer,
    keywords: ["start", "stop", "finish", "save entry"],
  },
  {
    id: "open-manual-entry",
    title: "Open Manual Time Entry",
    description: "Jump to the time log and open the manual entry form right away.",
    group: "Entries",
    defaultShortcut: "mod+shift+n",
    icon: PlusCircle,
    keywords: ["new entry", "quick add", "timesheet"],
  },
  {
    id: "go-to-timer",
    title: "Go to Timer",
    description: "Navigate to the live timer screen.",
    group: "Navigation",
    defaultShortcut: "mod+1",
    icon: Timer,
    keywords: ["clock", "recording", "home"],
  },
  {
    id: "go-to-log",
    title: "Go to Time Log",
    description: "Navigate to the time log to review and edit tracked entries.",
    group: "Navigation",
    defaultShortcut: "mod+2",
    icon: ClipboardList,
    keywords: ["entries", "timesheet", "hours"],
  },
  {
    id: "go-to-dashboard",
    title: "Go to Dashboard",
    description: "Navigate to your metrics, earnings, and receivables dashboard.",
    group: "Navigation",
    defaultShortcut: "mod+3",
    icon: LayoutDashboard,
    keywords: ["metrics", "stats", "receivables"],
  },
  {
    id: "go-to-invoices",
    title: "Go to Invoices",
    description: "Navigate to the invoice workspace.",
    group: "Navigation",
    defaultShortcut: "mod+4",
    icon: FileText,
    keywords: ["billing", "gmail", "pdf"],
  },
  {
    id: "go-to-settings",
    title: "Go to Settings",
    description: "Navigate to the settings workspace.",
    group: "Navigation",
    defaultShortcut: "mod+5",
    icon: Settings2,
    keywords: ["preferences", "configuration"],
  },
  {
    id: "open-shortcuts-settings",
    title: "Open Keyboard Shortcuts Settings",
    description: "Open the Shortcuts tab in Settings so you can customize hotkeys.",
    group: "Settings",
    defaultShortcut: null,
    icon: Keyboard,
    keywords: ["hotkeys", "shortcuts", "command palette"],
  },
];

export const SHORTCUT_DEFINITIONS_BY_ID = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition]),
) as Record<ShortcutActionId, ShortcutDefinition>;

export const IMPORTANT_SHORTCUT_ACTION_IDS: ShortcutActionId[] = [
  "open-command-palette",
  "toggle-timer",
  "open-manual-entry",
];

export function isShortcutActionId(value: string): value is ShortcutActionId {
  return value in SHORTCUT_DEFINITIONS_BY_ID;
}

export function getDefaultShortcutBindings(): ShortcutBindings {
  return SHORTCUT_DEFINITIONS.reduce<ShortcutBindings>((bindings, definition) => {
    if (definition.defaultShortcut) {
      bindings[definition.id] = definition.defaultShortcut;
    }
    return bindings;
  }, {});
}

export function normalizeShortcutBindings(
  bindings: Record<string, string | null | undefined>,
): ShortcutBindings {
  const normalized: ShortcutBindings = {};

  for (const [actionId, shortcut] of Object.entries(bindings)) {
    if (!isShortcutActionId(actionId)) continue;
    const normalizedShortcut = normalizeShortcut(shortcut);
    if (!normalizedShortcut) continue;
    normalized[actionId] = normalizedShortcut;
  }

  return normalized;
}

export function createShortcutDraft(bindings: ShortcutBindings): Record<ShortcutActionId, string> {
  return SHORTCUT_DEFINITIONS.reduce<Record<ShortcutActionId, string>>((draft, definition) => {
    draft[definition.id] = bindings[definition.id] ?? "";
    return draft;
  }, {} as Record<ShortcutActionId, string>);
}
