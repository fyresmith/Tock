interface ProfileSetupPromptProps {
  onOpenSettings: () => void;
  onDismiss: () => void;
}

export function ProfileSetupPrompt({
  onOpenSettings,
  onDismiss,
}: ProfileSetupPromptProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-2xl rounded border border-[var(--border-strong)] bg-[var(--surface-1)] p-4 shadow-2xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--warning)]">
              Before You Invoice
            </p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
              Finish setting up your profile
            </h2>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
              Add your name, email, and fallback client name so new invoice PDFs do not ship with blank sender details.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDismiss}
              className="rounded bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)]"
            >
              Later
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-hover)]"
            >
              Open Identity Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
