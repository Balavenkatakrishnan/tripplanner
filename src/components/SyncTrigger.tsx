"use client";

import { SyncProvider } from "@/hooks/useSync";

/** Runs background sync and provides sync() for manual refresh. */
export function SyncTrigger({ children }: { children: React.ReactNode }) {
  return <SyncProvider>{children}</SyncProvider>;
}
