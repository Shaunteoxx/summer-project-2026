// The Home Screen icon choice: what's remembered, what Safari will read when
// the app is added, and that a device with no usable storage still gets an
// icon. The last two check the images the script renders are the ones offered.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { APP_ICONS, appIcon, applyAppIcon, setAppIcon } from "@/lib/appIcon";

// Plain paths: jsdom replaces the global URL, and fs won't take its objects.
const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "../..");

const touchIcon = () => document.querySelector('link[rel="apple-touch-icon"]');
const [wallet, piggy] = APP_ICONS;

beforeEach(() => {
  document.head.innerHTML = `<link rel="apple-touch-icon" href="${wallet.src}" />`;
  vi.restoreAllMocks();
});

describe("appIcon", () => {
  it("is the wallet until another is picked", () => {
    expect(appIcon()).toBe(wallet);
  });

  it("remembers a pick on this device", () => {
    setAppIcon("piggy");
    expect(appIcon()).toBe(piggy);
  });

  it("falls back to the wallet for an icon it doesn't offer", () => {
    localStorage.setItem("bnm_app_icon", "rocket");
    expect(appIcon()).toBe(wallet);
  });

  it("falls back to the wallet when storage can't be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(appIcon()).toBe(wallet);
  });
});

describe("setAppIcon", () => {
  it("points Safari's Home Screen icon at the pick straight away", () => {
    setAppIcon("piggy");
    expect(touchIcon()).toHaveAttribute("href", piggy.src);
  });

  it("forgets the choice rather than storing the default", () => {
    setAppIcon("piggy");
    setAppIcon("wallet");
    expect(localStorage.getItem("bnm_app_icon")).toBeNull();
    expect(touchIcon()).toHaveAttribute("href", wallet.src);
  });

  it("still applies a pick that can't be saved, for adding the app now", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(setAppIcon("piggy")).toBe(piggy);
    expect(touchIcon()).toHaveAttribute("href", piggy.src);
  });
});

describe("applyAppIcon", () => {
  it("puts the remembered pick in place on load", () => {
    localStorage.setItem("bnm_app_icon", "piggy");
    applyAppIcon();
    expect(touchIcon()).toHaveAttribute("href", piggy.src);
  });

  it("adds the link when the page has none", () => {
    document.head.innerHTML = "";
    applyAppIcon();
    expect(touchIcon()).toHaveAttribute("href", wallet.src);
  });
});

describe("the icons on offer", () => {
  it("each have their image in public/icons", () => {
    for (const { src } of APP_ICONS) {
      expect(existsSync(join(FRONTEND, "public", src.split("?")[0])), src).toBe(true);
    }
  });

  it("start from the icon index.html already links", () => {
    const html = readFileSync(join(FRONTEND, "index.html"), "utf8");
    expect(html).toContain(`<link rel="apple-touch-icon" href="${wallet.src}" />`);
  });
});
