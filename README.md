# Tock

Desktop app for time tracking and invoicing. Built with Tauri v2, React 19, and Rust. All data lives locally in a SQLite database.

---

## Features

**Timer** — Start and stop a session with a single click. On stop, assign a description and tag. The active session survives unexpected quits and is recovered on next launch. A system tray icon shows live elapsed time and exposes start/stop/discard actions without opening the main window.

**Time Log** — Filterable list of all past entries by date range, tag, client, billable status, and invoiced status. Supports inline editing, manual entry creation, and bulk operations (delete, retag, reassign client).

**Invoicing** — Full invoice lifecycle: preview → create → issue → send → paid. Five PDF formats: `detailed`, `daily`, `weekly`, `type-breakdown`, and `simple`. PDFs are generated client-side via jsPDF. When an invoice is marked as sent, all linked entries are snapshotted — edits to live entries after that point have no effect on the invoice record.

**Dashboard** — Hours and earnings for the current week, month, last month, and YTD. Daily bar chart, 12-week trend line, monthly history table, and an accounts-receivable panel broken down by client.

**Clients** — Billing clients with per-client hourly rates. Rate resolution order: entry → client → global default.

**Tags** — Color-coded entry tags with custom sort order. Archivable without affecting historical entries.

**Backup and Restore** — Auto-backup runs after every significant mutation. Backups are ZIP archives with SHA-256 checksums for the database and each PDF. Retention policy: all backups within 48 hours, one per day for 30 days, one per week for 12 weeks. Restores are staged — the app writes the backup to a `restore-pending` directory, restarts, and swaps the database file before the connection pool initializes. CSV export also available.

---

## Keyboard Shortcuts

All shortcuts are rebindable in Settings and stored in the database.

| Action | Default |
|---|---|
| Command palette | `Cmd/Ctrl+K` |
| Toggle timer | `Space` |
| New manual entry | `Cmd/Ctrl+Shift+N` |
| Timer | `Cmd/Ctrl+1` |
| Log | `Cmd/Ctrl+2` |
| Dashboard | `Cmd/Ctrl+3` |
| Invoices | `Cmd/Ctrl+4` |
| Settings | `Cmd/Ctrl+5` |

---

## Stack

**Frontend** — React 19, TypeScript 5.8, Tailwind CSS v4, Zustand v5, Recharts, jsPDF, Vite 7

**Backend** — Tauri v2, Rust 2021, SQLite via sqlx 0.8 (async, Tokio)

Every user action flows from a React component through a typed `invoke()` call in `commands.ts` to a `#[tauri::command]` Rust function against the SQLite pool. No REST layer. When the backend mutates timer state — including from the tray menu — it emits a `timer-changed` event that `useTimerSync` picks up to keep the window and tray in sync.

---

## Project Structure

```
Tock/
├── src/
│   ├── App.tsx                   # Root component, global shortcuts, tray events
│   ├── stores/timerStore.ts      # Zustand store for active timer state
│   ├── hooks/                    # Data-fetching hooks over Tauri invoke
│   ├── lib/
│   │   ├── commands.ts           # Typed invoke() API surface
│   │   ├── shortcutRegistry.ts   # Action definitions, defaults, palette keywords
│   │   ├── billing.ts            # Client-side billing math
│   │   └── ...
│   └── components/
│       ├── layout/               # Sidebar
│       ├── timer/                # TimerView, StopPrompt
│       ├── log/                  # TimeLogView, EntryRow, EntryForm, filters
│       ├── dashboard/            # Charts and stats
│       ├── invoices/             # Invoice flow, PDF generation and viewer
│       ├── settings/             # Multi-section settings panel
│       ├── command/              # Command palette
│       └── tags/                 # Tag management
│
└── src-tauri/src/
    ├── lib.rs                    # App builder, command registration
    ├── tray.rs                   # Tray menu, 1-second live update loop
    ├── backup/mod.rs             # ZIP backup, restore, CSV export
    ├── db/                       # Connection pool, migrations
    └── commands/
        ├── timer.rs
        ├── entries.rs
        ├── invoices.rs
        ├── settings.rs           # Settings, shortcut handling, dashboard query
        ├── clients.rs
        └── tags.rs
```

---

## Getting Started

**Prerequisites:** [Rust](https://www.rust-lang.org/tools/install) stable, Node.js 18+, and the [Tauri system dependencies](https://tauri.app/start/prerequisites/) for your platform.

```bash
npm install
npm run tauri dev
```

```bash
# Production build — installers written to src-tauri/target/release/bundle/
npm run tauri build
```

---

## Data

The database and backups are stored in the platform app data directory:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/com.tock.app/` |
| Windows | `%APPDATA%\com.tock.app\` |
| Linux | `~/.local/share/com.tock.app/` |

The backup directory is configurable in Settings.
