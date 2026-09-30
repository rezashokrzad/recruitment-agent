/**
 * Process-wide singletons.
 *
 * In development Next.js re-evaluates modules on every hot reload, which would
 * silently create a second queue / rate-limit map next to the old one. Storing
 * the instance on `globalThis` keeps exactly one per Node process.
 */
export function singleton<T>(key: string, create: () => T): T {
  const store = globalThis as unknown as Record<string, T | undefined>;
  const slot = `__recruitment_${key}`;
  store[slot] ??= create();
  return store[slot];
}
