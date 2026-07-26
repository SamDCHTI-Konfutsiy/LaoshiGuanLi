/**
 * localStorage access guarded against environments where it can throw
 * (private browsing quota errors, storage disabled by policy, SSR).
 */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignored: persistence is a convenience, not a requirement.
  }
}
