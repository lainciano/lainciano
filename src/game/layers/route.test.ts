import { describe, expect, it } from "vitest";
import { layerForPath } from "./route";

describe("layerForPath", () => {
  it.each(["/", "/work/x", "/blog/post", "/contact", ""])("na 1A %j cai em cinza", (p) => {
    expect(layerForPath(p)).toBe("cinza");
  });
});
