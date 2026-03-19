ALTER TABLE invoices ADD COLUMN format TEXT NOT NULL DEFAULT 'detailed';
ALTER TABLE invoices ADD COLUMN layout_data TEXT;
