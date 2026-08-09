import { describe, expect, it } from "vitest";
import { displayHost } from "./postDisplay";

describe("displayHost", () => {
  it("strips a leading www.", () => {
    expect(displayHost("https://www.simonwillison.net/2026/some-post")).toBe("simonwillison.net");
  });

  it("leaves a non-www host untouched", () => {
    expect(displayHost("https://news.ycombinator.com/item?id=1")).toBe("news.ycombinator.com");
  });

  it("falls back to the raw input when it isn't a valid URL", () => {
    expect(displayHost("not a url")).toBe("not a url");
  });
});
