import { describe, expect, it } from "vitest";

import { AsyncResultCache } from "../../../src/ai/context/cache.js";

describe("model discovery cache", () => {
  it("coalesces cache misses, expires entries, and supports invalidation", async () => {
    let now = 100;
    let loads = 0;
    const cache = new AsyncResultCache<string>(2, () => now);
    const loader = async () => {
      loads++;
      await Promise.resolve();
      return "result-" + loads;
    };
    const [first, concurrent] = await Promise.all([
      cache.getOrLoad("models", 50, loader),
      cache.getOrLoad("models", 50, loader)
    ]);
    expect(first).toBe("result-1");
    expect(concurrent).toBe(first);
    expect(loads).toBe(1);

    now += 51;
    await expect(cache.getOrLoad("models", 50, loader)).resolves.toBe("result-2");
    expect(cache.delete("models")).toBe(true);
    await expect(cache.getOrLoad("models", 50, loader)).resolves.toBe("result-3");
  });
});
