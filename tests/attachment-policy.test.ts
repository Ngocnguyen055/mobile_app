import { describe, expect, it } from "vitest";

import {
  MAX_ATTACHMENT_BYTES,
  attachmentValidationError,
} from "../src/mobile/domain/attachmentPolicy.ts";

describe("mobile attachment policy", () => {
  it("accepts up to three files at or below 512 KiB", () => {
    expect(
      attachmentValidationError(0, [
        { name: "a.png", size: MAX_ATTACHMENT_BYTES },
        { name: "b.pdf", size: 12 },
        { name: "c.txt", size: 1 },
      ]),
    ).toBeNull();
  });

  it("rejects too many files including files already selected", () => {
    expect(
      attachmentValidationError(2, [
        { name: "c.png", size: 1 },
        { name: "d.png", size: 1 },
      ]),
    ).toContain("tối đa 3 tệp");
  });

  it("rejects an oversized file and identifies it in the popup message", () => {
    expect(
      attachmentValidationError(0, [
        { name: "anh-lon.png", size: MAX_ATTACHMENT_BYTES + 1 },
      ]),
    ).toContain("anh-lon.png");
  });
});
