// The pack's entry point is plain JavaScript on purpose. Pulumi's Node policy
// runner always registers its vendored ts-node 7 for a `.ts` entry point, and
// that compiler rejects this repo's `.ts` import paths. A `.js` entry is loaded
// by Node's own ESM loader, which strips the types from pack.ts and everything
// it imports, exactly as it does for the stacks.
import "./pack.ts";
