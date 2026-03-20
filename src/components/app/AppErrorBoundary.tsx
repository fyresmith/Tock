import React from "react";

type AppErrorBoundaryState = {
  error: Error | null;
  source: "react" | "window" | "promise" | null;
};

export class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
    source: null,
  };

  private handleWindowError = (event: ErrorEvent) => {
    if (this.state.error) return;
    this.setState({
      error: event.error instanceof Error ? event.error : new Error(event.message || "Unexpected application error"),
      source: "window",
    });
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (this.state.error) return;

    const reason =
      event.reason instanceof Error
        ? event.reason
        : new Error(typeof event.reason === "string" ? event.reason : "Unhandled promise rejection");

    this.setState({
      error: reason,
      source: "promise",
    });
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      error,
      source: "react",
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("AppErrorBoundary caught a render error", error, errorInfo);
  }

  componentDidMount() {
    window.addEventListener("error", this.handleWindowError);
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener("error", this.handleWindowError);
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleTryAgain = () => {
    this.setState({
      error: null,
      source: null,
    });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const sourceLabel =
      this.state.source === "react"
        ? "render"
        : this.state.source === "promise"
          ? "async"
          : "runtime";

    return (
      <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text-primary)]">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-xl rounded border border-[var(--border-strong)] bg-[var(--surface-1)] p-6 shadow-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--danger)]">
              Application Error
            </p>
            <h1 className="mt-2 text-xl font-semibold">Tock hit an unexpected {sourceLabel} error.</h1>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              The app is showing a recovery screen instead of a blank window. You can try again or reload the app.
            </p>

            <div className="mt-4 rounded border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <p className="font-mono text-xs text-[var(--text-primary)]">
                {this.state.error.message || "Unknown error"}
              </p>
              {this.state.error.stack && (
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-[var(--text-muted)]">
                  {this.state.error.stack}
                </pre>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={this.handleTryAgain}
                className="rounded bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)]"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="rounded bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-hover)]"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
