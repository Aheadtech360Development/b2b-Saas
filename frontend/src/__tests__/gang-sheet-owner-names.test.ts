/**
 * A design downloaded from a gang sheet job is named for whose it is: the
 * order's number and the customer in front of the name it was uploaded with,
 * so a folder of downloads says which job each file came from.
 */
import { describe, expect, it } from "vitest";
import { withOwner } from "@/lib/download";

describe("a design's download name", () => {
  it("puts the order's number and the customer in front", () => {
    expect(withOwner("logo.png", "1042", "Zain Ahmed")).toBe("1042-Zain-Ahmed-logo.png");
  });

  it("leaves out what is not known, and Guest, which is not a name", () => {
    expect(withOwner("logo.png", null, "Guest")).toBe("logo.png");
    expect(withOwner("logo.png", "#1042", undefined)).toBe("1042-logo.png");
    expect(withOwner("logo.png")).toBe("logo.png");
  });
});
