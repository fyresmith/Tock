export type View = "timer" | "log" | "dashboard" | "invoices" | "settings";

export const APP_VIEWS: View[] = ["timer", "log", "dashboard", "invoices", "settings"];

export type SettingsSection =
  | "clients"
  | "billing"
  | "identity"
  | "appearance"
  | "shortcuts"
  | "tags"
  | "data";
