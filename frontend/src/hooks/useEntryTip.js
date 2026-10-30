import { useEffect, useRef, useState } from "react";

import { useAccounts } from "@/hooks/useAccounts";
import { useTour, useTourContext } from "@/tour/TourProvider";
import { pickEntryTip } from "@/lib/entryDraft";

/**
 * Which tip this opening of the entry sheet gets, chosen as the sheet opens and
 * held until it closes — so finishing one doesn't queue the next up behind it.
 * None while editing: that entry has already happened. Asked for only while the
 * form is showing, since the keypad covers all three.
 *
 * `type` is null while the sheet is closed; `calcOpen` is whether the keypad is.
 */
export function useEntryTip({ type, isEdit, calcOpen }) {
  const tour = useTourContext();
  const { hasAccounts } = useAccounts();
  const [openTip, setOpenTip] = useState(null);
  const wasOpen = useRef(false);
  // No dependency list on purpose: it runs after every render and acts only
  // when the sheet goes from closed to open, which the ref detects.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const open = type !== null;
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    setOpenTip(open && !isEdit ? pickEntryTip(tour, { type, hasAccounts }) : null);
  });
  useTour(openTip, Boolean(openTip) && !calcOpen);
}
