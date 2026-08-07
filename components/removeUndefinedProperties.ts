/**
 * Deep-strips undefined values from objects and arrays.
 *
 * Lives in its own module with ZERO imports on purpose. `op.ts` needs it, and
 * importing it from `helpers.ts` closes a cycle:
 *
 *   op.ts -> helpers.ts -> @dynamic/1password/OnePasswordItem.ts
 *         -> components/store/index.ts -> op.ts
 *
 * `store/index.ts` constructs an OPClient at module scope, so whenever that
 * cycle is entered via `op.ts` the constructor runs before the class binding is
 * initialised and Node throws "Cannot access 'OPClient' before initialization".
 * Keep this file dependency-free.
 */
export function removeUndefinedProperties<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.filter(item => item !== undefined).map(item => removeUndefinedProperties(item)) as T;
  }
  if (typeof obj === "object" && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefinedProperties(v)] as const),
    ) as T;
  }
  return obj;
}
