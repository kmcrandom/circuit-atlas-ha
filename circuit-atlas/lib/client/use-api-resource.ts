"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "./api";

export type ApiResourceState<T> =
  | { status: "loading"; data?: T; error?: undefined }
  | { status: "ready"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: Error };

export type ApiResource<T> = ApiResourceState<T> & {
  reload: () => void;
};

/**
 * Small fetch resource for route-level data. It keeps a previously loaded value
 * during a refresh, cancels obsolete requests, and never shares data between
 * property URLs.
 */
export function useApiResource<T>(
  path: string | null,
  options?: { initialData?: T },
): ApiResource<T> {
  const initialDataRef = useRef(options?.initialData);
  const previousPathRef = useRef<string | null>(path);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ApiResourceState<T>>(() =>
    initialDataRef.current === undefined
      ? { status: "loading" }
      : { status: "ready", data: initialDataRef.current },
  );

  useEffect(() => {
    if (!path) {
      setState(
        initialDataRef.current === undefined
          ? { status: "loading" }
          : { status: "ready", data: initialDataRef.current },
      );
      return;
    }

    const controller = new AbortController();
    const isSamePath = previousPathRef.current === path;
    previousPathRef.current = path;
    setState((current) =>
      isSamePath
        ? {
            status: "loading",
            ...(current.data === undefined ? {} : { data: current.data }),
          }
        : { status: "loading" },
    );

    void apiRequest<T>(path, { signal: controller.signal })
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          status: "error",
          ...(current.data === undefined ? {} : { data: current.data }),
          error: error instanceof Error ? error : new Error("The request failed."),
        }));
      });

    return () => controller.abort();
  }, [path, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { ...state, reload };
}
