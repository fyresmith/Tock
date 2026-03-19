-- Tock initial schema

CREATE TABLE IF NOT EXISTS entry_tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,           -- YYYY-MM-DD
    start_time TEXT NOT NULL,     -- HH:MM:SS
    end_time TEXT,                -- HH:MM:SS, NULL if active
    duration_minutes INTEGER,     -- computed on stop
    description TEXT NOT NULL DEFAULT '',
    entry_type TEXT NOT NULL DEFAULT 'work',  -- legacy display/cache of the tag name
    tag_id TEXT,
    invoiced INTEGER NOT NULL DEFAULT 0,      -- 0 | 1
    invoice_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    period_start TEXT NOT NULL,   -- YYYY-MM-DD
    period_end TEXT NOT NULL,     -- YYYY-MM-DD
    total_hours REAL NOT NULL,
    hourly_rate REAL NOT NULL,
    total_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'issued' | 'sent' | 'paid'
    pdf_path TEXT,
    created_at TEXT NOT NULL,
    issued_at TEXT,
    sent_at TEXT,
    due_at TEXT,
    paid_at TEXT,
    locked_at TEXT
);

CREATE TABLE IF NOT EXISTS invoice_entry_snapshots (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    entry_id TEXT,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration_minutes INTEGER,
    description TEXT NOT NULL,
    tag_id TEXT,
    tag_name TEXT NOT NULL,
    tag_color TEXT NOT NULL,
    billable INTEGER NOT NULL DEFAULT 1,
    billed_minutes INTEGER,
    hourly_rate REAL NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO entry_tags (id, name, color, sort_order, is_archived, created_at, updated_at) VALUES
    ('default-work', 'Work', '#22c55e', 0, 0, '2026-01-01T00:00:00', '2026-01-01T00:00:00'),
    ('default-meeting', 'Meeting', '#f59e0b', 1, 0, '2026-01-01T00:00:00', '2026-01-01T00:00:00'),
    ('default-admin', 'Admin', '#64748b', 2, 0, '2026-01-01T00:00:00', '2026-01-01T00:00:00');

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('hourly_rate', '75.00'),
    ('currency', 'USD'),
    ('user_name', ''),
    ('user_email', ''),
    ('employer_name', ''),
    ('backup_directory', ''),
    ('auto_backup_enabled', '1'),
    ('backup_csv_path', ''),
    ('theme', 'dark'),
    ('invoice_notes', 'Payment due within 30 days. Thank you for your business.');
