# Tock

A local-first time tracking and invoicing desktop app for freelancers. Built with Tauri v2, React 19, and Rust. All data lives in a SQLite database on your machine — no accounts, no cloud sync, no telemetry.

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.2.0-green)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
- [Building for Production](#building-for-production)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Data & Privacy](#data--privacy)
- [Backup & Restore](#backup--restore)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Tock is designed for freelancers who want a fast, keyboard-driven tool to track time and turn it into invoices — without handing their client data to a SaaS vendor. There is no backend server, no subscription, and no internet required. The entire application runs on your machine and stores everything locally in a SQLite database.

Every user action flows from a React component through a typed `invoke()` call to a Rust command handler against the local SQLite pool. When the backend mutates timer state — including from the system tray — it emits a `timer-changed` event that the frontend picks up to keep the window and tray synchronized.

---

## Features

### Timer
Start and stop a session with a single click or keyboard shortcut. On stop, assign a description, client, and tag. The active session is persisted to the database immediately on start — if the app crashes or is force-quit, the session is recovered on next launch. The system tray icon displays live elapsed time and exposes Start, Stop, and Discard actions without needing to open the main window.

### Time Log
A filterable list of all past entries. Filter by date range, tag, client, billable status, and invoiced status simultaneously. Supports:
- Inline editing of any field on any entry
- Manual entry creation with full date and time control
- Bulk operations: delete, retag, and reassign client across multiple selected entries

### Invoicing
Full invoice lifecycle management:

| Status | Description |
|--------|-------------|
| Draft | Being assembled, not yet sent |
| Issued | Finalized and ready to send |
| Sent | Delivered to client — entries are snapshotted at this point |
| Paid | Invoice settled |

Five PDF formats are available: `detailed`, `daily`, `weekly`, `type-breakdown`, and `simple`. PDFs are generated entirely client-side using jsPDF. When an invoice is marked as sent, all linked time entries are snapshotted — subsequent edits to the live entries have no effect on the invoice record. Invoices can be reverted to draft before the send snapshot is created.

### Dashboard
At-a-glance financial overview including:
- Hours and earnings for the current week, current month, last month, and year-to-date
- Daily bar chart for the current week
- 12-week rolling trend line
- Monthly history table
- Accounts-receivable panel broken down by client

### Clients
Manage billing clients with per-client hourly rates. Rate resolution order: **entry-level rate → client rate → global default rate**. Clients can be archived without affecting historical entries or invoices.

### Tags
Color-coded entry tags with a configurable sort order. Useful for categorizing time by project type or activity. Tags can be archived; archived tags are hidden from pickers but preserved on all historical entries.

### Settings
- Personal and business identity (name, email, company name) used in PDF generation
- Global default hourly rate and currency
- Time rounding strategy for billing
- Invoice footer notes
- Configurable backup directory
- Theme (dark / light)
- Fully rebindable keyboard shortcuts

---

## Tech Stack

### Frontend

| Technology | Version | Role |
|------------|---------|------|
| React | 19 | UI framework |
| TypeScript | 5.8 | Type safety |
| Tailwind CSS | v4 | Styling |
| Zustand | 5 | Client state management |
| Recharts | 3 | Charts and data visualization |
| jsPDF + jspdf-autotable | — | Client-side PDF generation |
| pdfjs-dist | — | In-app PDF viewer |
| Lucide React | — | Icon library |
| Vite | 7 | Dev server and bundler |

### Backend

| Technology | Version | Role |
|------------|---------|------|
| Tauri | v2 | Desktop runtime and IPC bridge |
| Rust | 2021 edition | Command handlers and system integration |
| SQLite (via sqlx) | 0.8 | Local database with async Tokio runtime |
| Tokio | 1 | Async runtime |
| Chrono | 0.4 | Date and time handling |
| UUID | 1 (v4) | ID generation |
| SHA-256 (via sha2) | 0.10 | Backup integrity verification |
| zip / walkdir | — | Backup archive creation |

---

## Architecture

```
┌─────────────────────────────────────┐
│         React Frontend (TS)         │
│  Components → Zustand → commands.ts │
└──────────────┬──────────────────────┘
               │ typed invoke() over Tauri IPC
┌──────────────▼──────────────────────┐
│        Rust Command Handlers        │
│  #[tauri::command] functions        │
└──────────────┬──────────────────────┘
               │ sqlx async queries
┌──────────────▼──────────────────────┐
│        SQLite (local file)          │
│  ~/Library/Application Support/...  │
└─────────────────────────────────────┘
```

**IPC Flow**

1. A React component calls a typed wrapper in `src/lib/commands.ts` (e.g., `startTimer()`).
2. That wrapper calls Tauri's `invoke("start_timer", { ... })`.
3. Tauri routes the call to the corresponding `#[tauri::command]` Rust function.
4. The Rust handler accesses the shared `SqlitePool` from app state and executes the query.
5. On timer mutations, the backend emits a `timer-changed` event.
6. The `useTimerSync` hook in the frontend picks up that event and updates Zustand state.

**System Tray**

The tray runs a dedicated async loop on a 1-second interval. It reads the active timer state from SQLite, updates the tray tooltip with elapsed time, and toggles menu items (Start / Stop / Discard) based on whether a session is active. The tray and the main window share the same database as the source of truth — there is no separate in-memory state to synchronize.

**Backup System**

Backups are triggered automatically after every significant write operation. Each backup is a ZIP archive containing:
- The raw SQLite database file
- All invoice PDFs
- A `manifest.json` with app version, timestamp, and SHA-256 checksums for every included file

Restore is staged: the app writes the backup to a `restore-pending` directory and restarts. On the next launch, before the database connection pool initializes, the pending restore is swapped in.

---

## Project Structure

```
Tock/
├── src/                                # React frontend
│   ├── App.tsx                         # Root component: routing, global shortcuts, tray event listener
│   ├── main.tsx                        # React DOM entry point
│   ├── stores/
│   │   └── timerStore.ts               # Zustand store for active timer state
│   ├── hooks/                          # Data-fetching hooks over Tauri invoke
│   │   ├── useEntries.ts
│   │   ├── useTimerSync.ts             # Listens for timer-changed events
│   │   ├── useClients.ts
│   │   ├── useSettings.ts
│   │   └── ...
│   ├── lib/
│   │   ├── commands.ts                 # Typed invoke() wrappers + all TypeScript interfaces
│   │   ├── shortcutRegistry.ts         # Action definitions, defaults, command palette keywords
│   │   ├── billing.ts                  # Client-side rate resolution and billing math
│   │   └── ...
│   └── components/
│       ├── layout/                     # Sidebar navigation
│       ├── timer/                      # TimerView, StopPrompt
│       ├── log/                        # TimeLogView, EntryRow, EntryForm, LogFilters
│       ├── dashboard/                  # DashboardView, charts, stats panels
│       ├── invoices/                   # InvoicesView, GenerateFlow, InvoicePDF, InvoicePdfViewer
│       ├── settings/                   # SettingsView (identity, shortcuts, backup, theme)
│       ├── command/                    # CommandPalette
│       ├── tags/                       # Tag management
│       └── ui/                         # DatePicker, TimePicker, Select, and other primitives
│
├── src-tauri/
│   ├── Cargo.toml                      # Rust dependencies
│   ├── tauri.conf.json                 # App identifier, window config, bundle targets
│   ├── src/
│   │   ├── lib.rs                      # App builder, plugin registration, command registration
│   │   ├── main.rs                     # Tauri entry point
│   │   ├── tray.rs                     # Tray setup, 1-second update loop, menu state
│   │   ├── db/
│   │   │   ├── mod.rs                  # Connection pool init, migration runner
│   │   │   └── migrations/
│   │   │       └── 001_initial.sql     # Full schema definition
│   │   ├── backup/
│   │   │   └── mod.rs                  # ZIP backup, restore staging, CSV export
│   │   └── commands/
│   │       ├── timer.rs                # start_timer, stop_timer, get_active_timer, discard_timer
│   │       ├── entries.rs              # CRUD + bulk operations for time entries
│   │       ├── invoices.rs             # Full invoice lifecycle commands
│   │       ├── settings.rs             # Settings, shortcut bindings, dashboard query
│   │       ├── clients.rs              # Client CRUD, archive, default management
│   │       └── tags.rs                 # Tag CRUD, sort order, archive
│   └── icons/                          # App icons and tray icon assets
│
├── public/                             # Static assets served by Vite
├── index.html                          # HTML shell
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Database Schema

All data is stored in a single SQLite file. The schema is defined in `src-tauri/src/db/migrations/001_initial.sql` and applied automatically on first launch.

### `time_entries`
The core time log.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | UUID v4 primary key |
| `date` | TEXT | ISO date (YYYY-MM-DD) |
| `start_time` | TEXT | HH:MM:SS |
| `end_time` | TEXT | HH:MM:SS, NULL if active |
| `duration_minutes` | INTEGER | NULL if active |
| `description` | TEXT | |
| `tag_id` | TEXT | FK → entry_tags |
| `client_id` | TEXT | FK → clients |
| `billable` | INTEGER | Boolean |
| `hourly_rate` | REAL | Snapshot of rate at entry time |
| `invoiced` | INTEGER | Boolean |
| `invoice_id` | TEXT | FK → invoices |
| `created_at` | TEXT | ISO 8601 |
| `updated_at` | TEXT | ISO 8601 |

### `entry_tags`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | UUID v4 primary key |
| `name` | TEXT | |
| `color` | TEXT | Hex color string |
| `sort_order` | INTEGER | User-configurable display order |
| `is_archived` | INTEGER | Boolean |

### `clients`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | UUID v4 primary key |
| `name` | TEXT | Display name |
| `hourly_rate` | REAL | Per-client override rate |
| `billing_name` | TEXT | Name on invoices |
| `billing_email` | TEXT | |
| `is_default` | INTEGER | Boolean, at most one default |
| `is_archived` | INTEGER | Boolean |

### `invoices`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | UUID v4 primary key |
| `invoice_number` | TEXT | Human-readable identifier |
| `period_start` | TEXT | |
| `period_end` | TEXT | |
| `total_hours` | REAL | |
| `hourly_rate` | REAL | |
| `total_amount` | REAL | |
| `status` | TEXT | `draft` / `issued` / `sent` / `paid` |
| `format` | TEXT | PDF format key |
| `client_id` | TEXT | FK → clients |
| `issued_at` | TEXT | |
| `sent_at` | TEXT | |
| `due_at` | TEXT | |
| `paid_at` | TEXT | |
| `locked_at` | TEXT | Set when snapshots are created |

### `invoice_entry_snapshots`
Immutable line items created when an invoice is marked as sent. Edits to `time_entries` after this point have no effect on the invoice.

| Column | Type | Notes |
|--------|------|-------|
| `invoice_id` | TEXT | FK → invoices |
| `entry_id` | TEXT | FK → time_entries |
| `duration_minutes` | INTEGER | Snapshotted value |
| `description` | TEXT | Snapshotted value |
| `tag_name` | TEXT | Snapshotted value |
| `tag_color` | TEXT | Snapshotted value |
| `billed_minutes` | INTEGER | After rounding applied |
| `hourly_rate` | REAL | Snapshotted value |
| `amount` | REAL | |

### `settings`
A key-value store. Notable keys:

| Key | Description |
|-----|-------------|
| `theme` | `dark` or `light` |
| `user_name` | Appears on invoice PDFs |
| `user_email` | Appears on invoice PDFs |
| `employer_name` | Business name on invoices |
| `currency` | Currency code (e.g. `USD`) |
| `hourly_rate` | Global default billable rate |
| `invoice_notes` | Footer text on all PDFs |
| `backup_directory` | Override path for backup files |
| `time_rounding` | Rounding strategy for billing |
| `shortcut_bindings` | JSON blob of action → key binding |

---

## Getting Started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Node.js](https://nodejs.org/) 18 or later
- Platform-specific Tauri dependencies — see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

### Install and Run

```bash
# Clone the repository
git clone https://github.com/your-username/tock.git
cd tock

# Install frontend dependencies
npm install

# Start the development build (hot-reloads frontend, rebuilds Rust on change)
npm run tauri dev
```

The app window will open automatically. The Vite dev server runs on `localhost:1420`.

---

## Building for Production

```bash
npm run tauri build
```

Compiled installers are written to `src-tauri/target/release/bundle/`:

| Platform | Output |
|----------|--------|
| macOS | `.dmg` and `.app` |
| Windows | `.msi` and `.exe` (NSIS) |
| Linux | `.AppImage` and `.deb` |

To target a specific bundle format, use the `--bundles` flag:

```bash
npm run tauri build -- --bundles dmg
```

### GitHub Actions

A release workflow is included at `.github/workflows/release.yml`. It triggers on any tag matching `v*` and builds for macOS and Ubuntu (Linux) in parallel, then attaches the installers to a GitHub release.

To cut a release:

```bash
git tag v0.2.0
git push origin v0.2.0
```

---

## Keyboard Shortcuts

All shortcuts are rebindable in **Settings → Shortcuts** and persisted in the database.

| Action | Default |
|--------|---------|
| Command palette | `Cmd/Ctrl + K` |
| Toggle timer | `Space` |
| New manual entry | `Cmd/Ctrl + Shift + N` |
| Go to Timer | `Cmd/Ctrl + 1` |
| Go to Log | `Cmd/Ctrl + 2` |
| Go to Dashboard | `Cmd/Ctrl + 3` |
| Go to Invoices | `Cmd/Ctrl + 4` |
| Go to Settings | `Cmd/Ctrl + 5` |

The command palette (`Cmd/Ctrl + K`) surfaces all actions by keyword and is the fastest way to navigate.

---

## Data & Privacy

Tock is entirely local. No data is sent anywhere.

The database and backups are stored in the platform app data directory:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/com.calebsmith.tock/` |
| Windows | `%APPDATA%\com.calebsmith.tock\` |
| Linux | `~/.local/share/com.calebsmith.tock/` |

The backup directory can be overridden to any path in Settings — useful for pointing it at a Dropbox or iCloud folder for offsite redundancy.

---

## Backup & Restore

### Automatic Backups

A backup is created automatically after every significant write operation (stopping a timer, saving an entry, issuing an invoice, etc.). Each backup is a ZIP archive containing:

- The raw SQLite database file
- All saved invoice PDFs
- `manifest.json` — app version, creation timestamp, table row counts, and SHA-256 checksums for every file in the archive

### Retention Policy

| Age | Kept |
|-----|------|
| ≤ 48 hours | All backups |
| 2–30 days | One backup per day |
| 30 days – 12 weeks | One backup per week |
| > 12 weeks | Deleted |

### Manual Backup

Trigger a backup at any time from **Settings → Backup**.

### Restore

Select any backup from the list in Settings to inspect its manifest before committing. Restoring:

1. Writes the backup contents to a `restore-pending` directory.
2. Restarts the app.
3. On the next launch, before the database connection pool initializes, the pending restore is swapped in.

This staged approach ensures the database is never in a half-restored state.

### CSV Export

Export the full time log to CSV from **Settings → Backup → Export CSV**. The file is written to the Downloads folder.

---

## Contributing

Contributions are welcome. Please open an issue before submitting a pull request for significant changes so the approach can be discussed first.

### Development Workflow

```bash
# Run the app in development mode
npm run tauri dev

# Type-check the frontend
npx tsc --noEmit

# Build the frontend only (no Rust)
npm run build

# Build Rust only (no frontend)
cargo build --manifest-path src-tauri/Cargo.toml
```

### Guidelines

- **Rust:** Follow standard Rust idioms. Run `cargo clippy` before submitting. Avoid `unwrap()` on anything that can realistically fail at runtime — use `?` or explicit error handling.
- **TypeScript:** All Tauri command inputs and outputs must have corresponding types in `src/lib/commands.ts`. Do not use `any`.
- **Database:** Schema changes must be additive (new columns with defaults or nullable, new tables). Do not modify existing migration files — add a new migration file.
- **No network calls:** Tock is intentionally local-only. Pull requests that introduce outbound network requests will not be merged.

---

## License

MIT. See [LICENSE](LICENSE) for the full text.
