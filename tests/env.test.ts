import { describe, it, expect } from "vitest";
import { envSchema } from "@/env";

describe("envSchema", () => {
  it("rejects when TMDB_API_KEY is missing", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an empty TMDB_API_KEY", () => {
    const result = envSchema.safeParse({ TMDB_API_KEY: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a non-empty TMDB_API_KEY", () => {
    const result = envSchema.safeParse({ TMDB_API_KEY: "abc" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TMDB_API_KEY).toBe("abc");
    }
  });
});
