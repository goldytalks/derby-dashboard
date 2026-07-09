// Console event stubs for v1. No network, no persistence.
export function logEvent(
  name: string,
  payload: Record<string, unknown> = {}
): void {
  if (typeof console !== "undefined") {
    console.info(`[booth] ${name}`, payload);
  }
}
