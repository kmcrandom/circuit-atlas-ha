"use client";

import { useEffect, useState } from "react";
import { withRuntimeBasePath } from "./runtime-path";

export type PdfPagePreview =
  | { status: "idle" | "loading"; src?: undefined; width?: undefined; height?: undefined; error?: undefined }
  | { status: "ready"; src: string; width: number; height: number; error?: undefined }
  | { status: "error"; src?: undefined; width?: undefined; height?: undefined; error: Error };

/** Renders one authenticated PDF page to a local bitmap URL for FloorPlanMap. */
export function usePdfPage(
  sourceUrl: string | null,
  pageNumber = 1,
): PdfPagePreview {
  const [state, setState] = useState<PdfPagePreview>({ status: sourceUrl ? "loading" : "idle" });

  useEffect(() => {
    if (!sourceUrl) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setState({ status: "loading" });

    void (async () => {
      const [response, pdfjs] = await Promise.all([
        fetch(withRuntimeBasePath(sourceUrl), { signal: controller.signal }),
        import("pdfjs-dist"),
      ]);
      if (!response.ok) throw new Error("The private PDF floor plan could not be loaded.");
      const data = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      pdfjs.GlobalWorkerOptions.workerSrc = withRuntimeBasePath(
        "/pdf.worker.min.mjs",
      );
      const pdfDocument = await pdfjs.getDocument({ data }).promise;
      const safePage = Math.max(1, Math.min(pdfDocument.numPages, pageNumber));
      const page = await pdfDocument.getPage(safePage);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("This browser cannot render the PDF floor plan.");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value: Blob | null) => value ? resolve(value) : reject(new Error("The PDF page could not be rendered.")), "image/png"),
      );
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setState({ status: "ready", src: objectUrl, width: canvas.width, height: canvas.height });
      await pdfDocument.cleanup();
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setState({ status: "error", error: error instanceof Error ? error : new Error("The PDF page could not be rendered.") });
      }
    });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pageNumber, sourceUrl]);

  return state;
}
