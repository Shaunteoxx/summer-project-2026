/**
 * The icon iPhone and iPad put on the Home Screen, picked under More → App
 * Icon.
 *
 * Safari copies the page's apple-touch-icon at the moment someone taps Add to
 * Home Screen, and nothing can change it afterwards, so the choice has to be
 * made before adding: this swaps the link Safari will read. Android installs
 * take their icon from the manifest, which every device shares, so the choice
 * is only offered on iOS.
 *
 * Kept on the device, like the theme. A Home Screen app also keeps its own
 * storage, apart from Safari's, so a choice made inside the installed app
 * could never reach the Safari tab that adds it again. The sheet explains the
 * way round instead of offering a choice there.
 */
import { isIos } from "@/lib/push";

const STORAGE_KEY = "bnm_app_icon";

// scripts/icons.mjs renders these images and stamps each URL with a hash of
// the file, so a changed icon is never served from a stale cache. The first is
// the default, and matches the apple-touch-icon link in index.html.
export const APP_ICONS = [
  { id: "wallet", name: "Wallet", src: "/icons/apple-touch-icon.png?v=ae683eb3" },
  { id: "piggy", name: "Piggy Bank", src: "/icons/apple-touch-icon-piggy.png?v=7957ab5c" },
];

const findIcon = (id) => APP_ICONS.find((icon) => icon.id === id) ?? APP_ICONS[0];

/** The icon this device will use: the wallet, unless another was picked. */
export function appIcon() {
  try {
    return findIcon(localStorage.getItem(STORAGE_KEY));
  } catch {
    return APP_ICONS[0];
  }
}

/** Point the Home Screen icon Safari will copy at the given icon's image. */
export function applyAppIcon(icon = appIcon()) {
  let link = document.querySelector('link[rel="apple-touch-icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "apple-touch-icon";
    document.head.appendChild(link);
  }
  link.setAttribute("href", icon.src);
}

export function setAppIcon(id) {
  const icon = findIcon(id);
  try {
    if (icon === APP_ICONS[0]) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, icon.id);
  } catch {
    // Storage unavailable: the choice holds until the page closes, which is
    // long enough to add the app now.
  }
  applyAppIcon(icon);
  return icon;
}

/** Only iOS reads the page's icon when adding it to the Home Screen. */
export const canChooseAppIcon = isIos;
