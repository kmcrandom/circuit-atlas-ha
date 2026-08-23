"use client";

import {
  createContext,
  useContext,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

const RuntimeBasePathContext = createContext("");

export function RuntimeBasePathProvider({
  basePath,
  children,
}: {
  basePath: string;
  children: ReactNode;
}) {
  return (
    <RuntimeBasePathContext.Provider value={basePath}>
      {children}
    </RuntimeBasePathContext.Provider>
  );
}

export function useRuntimeBasePath(): string {
  return useContext(RuntimeBasePathContext);
}

export function currentRuntimeBasePath(): string {
  if (typeof document === "undefined") return "";
  return document.documentElement.dataset.circuitAtlasBasePath || "";
}

export function withRuntimeBasePath(path: string, basePath?: string): string {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/__circuit_atlas/")
  ) {
    return path;
  }
  const prefix = basePath ?? currentRuntimeBasePath();
  if (!prefix || path === prefix || path.startsWith(`${prefix}/`)) return path;
  return `${prefix}${path}`;
}

export function withoutRuntimeBasePath(path: string, basePath?: string): string {
  const prefix = basePath ?? currentRuntimeBasePath();
  if (!prefix || !path.startsWith(prefix)) return path;
  const result = path.slice(prefix.length);
  return result.startsWith("/") ? result : `/${result}`;
}

export function navigateToAppPath(path: string, replace = false): void {
  const destination = withRuntimeBasePath(path);
  if (replace) window.location.replace(destination);
  else window.location.assign(destination);
}

export function updateAppHistory(path: string, replace = false): void {
  const destination = withRuntimeBasePath(path);
  if (replace) window.history.replaceState(null, "", destination);
  else window.history.pushState(null, "", destination);
}

export function AppLink({
  href,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string }) {
  const basePath = useRuntimeBasePath();
  return <a href={withRuntimeBasePath(href, basePath)} {...props} />;
}
