import RAPIER from "@dimforge/rapier3d-compat";

let initialization: Promise<void> | null = null;

export function initializeRapier(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    const originalWarn = console.warn;
    console.warn = (...messages: unknown[]): void => {
      const first = messages[0];
      if (
        typeof first === "string" &&
        first ===
          "using deprecated parameters for the initialization function; pass a single object instead"
      ) {
        return;
      }
      originalWarn(...messages);
    };
    try {
      await RAPIER.init();
    } finally {
      console.warn = originalWarn;
    }
  })();
  return initialization;
}
