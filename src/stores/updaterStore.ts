import { getVersion } from "@tauri-apps/api/app";
import { confirm } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

type UpdaterTone = "muted" | "success" | "warning" | "danger";

type UpdaterStatus = {
  tone: UpdaterTone;
  message: string;
} | null;

type UpdateCheckSource = "startup" | "manual";

type CheckForUpdatesOptions = {
  source?: UpdateCheckSource;
  silentNoUpdate?: boolean;
  silentErrors?: boolean;
};

interface UpdaterStore {
  currentVersion: string;
  latestVersion: string | null;
  downloadedBytes: number;
  totalBytes: number | null;
  isBusy: boolean;
  status: UpdaterStatus;
  ensureCurrentVersion: () => Promise<void>;
  runStartupCheck: (enabled: boolean) => Promise<void>;
  checkForUpdates: (options?: CheckForUpdatesOptions) => Promise<void>;
  clearStatus: () => void;
}

let startupCheckSettled = false;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildPromptMessage(
  version: string,
  body?: string,
  date?: string,
) {
  const releaseNotes = body?.trim() ? body.trim().slice(0, 900) : "No release notes were provided.";
  const publishedLine = date ? `Published: ${date}\n\n` : "";
  return `Tock ${version} is available.\n\n${publishedLine}${releaseNotes}\n\nDownload and install it now?`;
}

async function loadCurrentVersion(
  currentVersion: string,
  set: (state: Partial<UpdaterStore>) => void,
) {
  if (currentVersion) return currentVersion;
  const version = await getVersion();
  set({ currentVersion: version });
  return version;
}

export const useUpdaterStore = create<UpdaterStore>((set, get) => ({
  currentVersion: "",
  latestVersion: null,
  downloadedBytes: 0,
  totalBytes: null,
  isBusy: false,
  status: null,
  ensureCurrentVersion: async () => {
    try {
      await loadCurrentVersion(get().currentVersion, set);
    } catch {
      // Ignore version lookup failures and fall back to status-only messaging.
    }
  },
  runStartupCheck: async (enabled) => {
    if (startupCheckSettled) return;
    startupCheckSettled = true;

    await get().ensureCurrentVersion();
    if (!enabled || import.meta.env.DEV) {
      return;
    }

    await get().checkForUpdates({
      source: "startup",
      silentNoUpdate: true,
      silentErrors: true,
    });
  },
  checkForUpdates: async (options = {}) => {
    if (get().isBusy) return;

    const source = options.source ?? "manual";
    const silentNoUpdate = options.silentNoUpdate ?? false;
    const silentErrors = options.silentErrors ?? false;

    try {
      const currentVersion = await loadCurrentVersion(get().currentVersion, set);

      if (import.meta.env.DEV) {
        if (!silentNoUpdate) {
          set({
            status: {
              tone: "muted",
              message: "Update checks are disabled in dev builds. Use a packaged release to verify the updater flow.",
            },
          });
        }
        return;
      }

      set({
        isBusy: true,
        downloadedBytes: 0,
        totalBytes: null,
        status:
          source === "manual"
            ? { tone: "muted", message: "Checking for updates…" }
            : get().status,
      });

      const update = await check();
      if (!update) {
        if (!silentNoUpdate) {
          set({
            latestVersion: null,
            status: {
              tone: "success",
              message: `You're up to date on version ${currentVersion || "this build"}.`,
            },
          });
        }
        return;
      }

      set({ latestVersion: update.version });

      const shouldInstall = await confirm(
        buildPromptMessage(update.version, update.body, update.date),
        {
          title: "Update Available",
          kind: "info",
          okLabel: "Install Update",
          cancelLabel: "Later",
        },
      );

      if (!shouldInstall) {
        await update.close().catch(() => undefined);

        if (source === "manual") {
          set({
            status: {
              tone: "warning",
              message: `Tock ${update.version} is available whenever you're ready to install it.`,
            },
          });
        }
        return;
      }

      const handleDownloadEvent = (event: DownloadEvent) => {
        if (event.event === "Started") {
          set({
            totalBytes: event.data.contentLength ?? null,
            status: {
              tone: "warning",
              message: event.data.contentLength
                ? `Downloading Tock ${update.version} (${formatBytes(event.data.contentLength)})…`
                : `Downloading Tock ${update.version}…`,
            },
          });
          return;
        }

        if (event.event === "Progress") {
          const nextBytes = get().downloadedBytes + event.data.chunkLength;
          const totalBytes = get().totalBytes;
          set({
            downloadedBytes: nextBytes,
            status: {
              tone: "warning",
              message: totalBytes
                ? `Downloading Tock ${update.version}… ${formatBytes(nextBytes)} / ${formatBytes(totalBytes)}`
                : `Downloading Tock ${update.version}… ${formatBytes(nextBytes)}`,
            },
          });
          return;
        }

        set({
          status: {
            tone: "warning",
            message: `Installing Tock ${update.version}…`,
          },
        });
      };

      try {
        await update.downloadAndInstall(handleDownloadEvent);
      } finally {
        await update.close().catch(() => undefined);
      }

      set({
        status: {
          tone: "success",
          message: `Installed Tock ${update.version}. Restarting…`,
        },
      });
      await relaunch();
    } catch (error) {
      if (!silentErrors) {
        set({
          status: {
            tone: "danger",
            message: `Unable to check for updates: ${error}`,
          },
        });
      }
    } finally {
      set({ isBusy: false });
    }
  },
  clearStatus: () => set({ status: null }),
}));
