import { Repeat } from "lucide-react";

import SwitchRow from "@/components/SwitchRow";
import { repeatPlan } from "@/lib/entryDraft";

/**
 * The entry sheet's slot for repeating. While adding, the offer to repeat the
 * entry every month, from `date`; while editing a row a rule wrote, the note
 * that a change is to that one row. `editing` is the row being edited, or null.
 */
export default function EntryRepeat({ editing, repeat, onRepeat, date }) {
  return (
    <>
      {/* Rent and subscriptions are realised at the moment you log them, not
          later in a settings screen — so the offer to repeat sits here,
          after the date it derives its schedule from. Editing an existing
          entry doesn't offer it: that entry has already happened, and its
          rule (if any) is managed on the More page. */}
      {!editing && (
        <div data-tour="entry.repeat">
          <SwitchRow
            checked={repeat}
            onChange={onRepeat}
            label="Repeat Monthly"
            description={
              repeat && repeatPlan(date)
                ? repeatPlan(date).caption
                : undefined
            }
          />
        </div>
      )}
      {/* The same slot, while editing a row a rule wrote: say that changing
          or deleting it is this one time only. Otherwise a one-off month —
          a cheaper bill, a skipped subscription — looks like it might break
          the rule, and people leave a wrong entry rather than risk that. */}
      {editing && editing.recurringId && (
        <p className="flex gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-[13px] leading-snug text-ink-2">
          <Repeat className="mt-px h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          <span>
            Added by a repeating entry. Changing or deleting it only affects
            this one, not the entries still to come.
          </span>
        </p>
      )}
    </>
  );
}
