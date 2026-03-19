import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Minus, Plus, ScanLine } from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

type MapWithComputedInsert = Map<unknown, unknown> & {
  getOrInsertComputed?: (key: unknown, compute: () => unknown) => unknown;
};

const mapPrototype = Map.prototype as MapWithComputedInsert;
if (typeof mapPrototype.getOrInsertComputed !== "function") {
  Object.defineProperty(mapPrototype, "getOrInsertComputed", {
    configurable: true,
    writable: true,
    value(this: Map<unknown, unknown>, key: unknown, compute: () => unknown) {
      if (this.has(key)) {
        return this.get(key);
      }
      const value = compute();
      this.set(key, value);
      return value;
    },
  });
}

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ZoomMode = "fit-page" | "fit-width" | "custom";

interface InvoicePdfViewerProps {
  blob: Blob | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function InvoicePdfViewer({ blob }: InvoicePdfViewerProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit-page");
  const [customScale, setCustomScale] = useState(1);
  const [currentScale, setCurrentScale] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let activeDocument: PDFDocumentProxy | null = null;

    const loadDocument = async () => {
      if (!blob) {
        if (pdfDoc) {
          pdfDoc.destroy();
        }
        setPdfDoc(null);
        setPageCount(0);
        setPageNumber(1);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const loadingTask = getDocument({ data: bytes });
        const document = await loadingTask.promise;
        activeDocument = document;

        if (cancelled) {
          document.destroy();
          return;
        }

        setPdfDoc((previous) => {
          if (previous) {
            previous.destroy();
          }
          return document;
        });
        setPageCount(document.numPages);
        setPageNumber(1);
        setZoomMode("fit-page");
        setCustomScale(1);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to render the PDF preview");
          setPdfDoc(null);
          setPageCount(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDocument();

    return () => {
      cancelled = true;
      activeDocument?.destroy();
    };
  }, [blob]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current || viewportSize.width === 0 || viewportSize.height === 0) {
        return;
      }

      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(viewportSize.width - 32, 160);
      const availableHeight = Math.max(viewportSize.height - 32, 220);

      const nextScale =
        zoomMode === "fit-width"
          ? availableWidth / baseViewport.width
          : zoomMode === "fit-page"
          ? Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height)
          : customScale;

      const scale = clamp(nextScale, 0.35, 3);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const context = canvas.getContext("2d");
      if (!context) return;

      const devicePixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * devicePixelRatio);
      canvas.height = Math.floor(viewport.height * devicePixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);

      renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform:
          devicePixelRatio === 1
            ? undefined
            : [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0],
      });

      await renderTask.promise;

      if (!cancelled) {
        setCurrentScale(scale);
      }
    };

    renderPage().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Unable to render the PDF preview");
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [customScale, pageNumber, pdfDoc, viewportSize.height, viewportSize.width, zoomMode]);

  const handleZoom = (delta: number) => {
    setZoomMode("custom");
    setCustomScale((previous) => {
      const baseline = zoomMode === "custom" ? previous : currentScale;
      return clamp(baseline + delta, 0.35, 3);
    });
  };

  const canGoBack = pageNumber > 1;
  const canGoForward = pageNumber < pageCount;

  return (
    <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-2)] xl:min-h-0">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">PDF Preview</p>
          <p className="text-xs text-[var(--text-muted)]">
            Full-page preview with zoom controls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-1)] p-1">
            <button
              onClick={() => setZoomMode("fit-page")}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                zoomMode === "fit-page"
                  ? "bg-[var(--brand)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
              }`}
            >
              <Expand size={12} className="inline mr-1" />
              Fit Page
            </button>
            <button
              onClick={() => setZoomMode("fit-width")}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                zoomMode === "fit-width"
                  ? "bg-[var(--brand)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
              }`}
            >
              <ScanLine size={12} className="inline mr-1" />
              Fit Width
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-1)] p-1">
            <button
              onClick={() => handleZoom(-0.1)}
              className="rounded-full p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
            >
              <Minus size={14} />
            </button>
            <span className="min-w-[4.25rem] text-center text-xs font-medium text-[var(--text-primary)]">
              {Math.round(currentScale * 100)}%
            </span>
            <button
              onClick={() => handleZoom(0.1)}
              className="rounded-full p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-1)] p-1">
            <button
              onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
              disabled={!canGoBack}
              className="rounded-full p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-3)] disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="min-w-[4.5rem] text-center text-xs font-medium text-[var(--text-primary)]">
              {pageCount === 0 ? "0 / 0" : `${pageNumber} / ${pageCount}`}
            </span>
            <button
              onClick={() => setPageNumber((value) => Math.min(pageCount, value + 1))}
              disabled={!canGoForward}
              className="rounded-full p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-3)] disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.09),_transparent_45%),linear-gradient(180deg,#202031_0%,#161621_100%)] p-3 sm:p-4"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            Rendering preview…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : !blob ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            No preview available.
          </div>
        ) : (
          <div className="flex min-h-full items-center justify-center">
            <canvas
              ref={canvasRef}
              className="max-w-none rounded-md bg-white shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
            />
          </div>
        )}
      </div>
    </div>
  );
}
