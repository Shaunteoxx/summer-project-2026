import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./push";

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url, restoring padding and the URL-safe characters", () => {
    // Bytes 0xfb 0xff 0xbf encode to "-_-_" in base64url and "+/+/" in base64.
    expect(Array.from(urlBase64ToUint8Array("-_-_"))).toEqual([0xfb, 0xff, 0xbf]);
    expect(Array.from(urlBase64ToUint8Array("AQ"))).toEqual([1]);
  });
});
