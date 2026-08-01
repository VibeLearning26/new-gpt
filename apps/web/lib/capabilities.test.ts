import { describe, expect, it } from "vitest";

import { getModelMeta } from "./capabilities";

describe("getModelMeta", () => {
  it("resolves OpenCode's unprefixed API model ids", () => {
    const meta = getModelMeta("mimo-v2.5-free", "opencode", ["text", "image"]);

    expect(meta.displayName).toBe("MiMo v2.5 Free");
    expect(meta.provider).toBe("Xiaomi");
    expect(meta.capabilities).toContain("vision");
  });

  it("keeps a useful fallback for newly enabled models", () => {
    const meta = getModelMeta("future-fast-model", "opencode", ["text"]);

    expect(meta.displayName).toBe("Future Fast Model");
    expect(meta.provider).toBe("opencode");
    expect(meta.capabilities).toContain("fast");
  });
});
