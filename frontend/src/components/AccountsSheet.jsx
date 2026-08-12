import { useState } from "react";
import { Plus, Archive, ArchiveRestore, Trash2, Check, X } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/hooks/useAccounts";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { CUSTOM_COLOR_OPTIONS } from "@/lib/categories";

/**
 * Manage the accounts money is tagged against.
 *
 * Accounts with history can only be archived, never deleted — removing one
 * would leave its transactions pointing at nothing, quietly dropping them out
 * of the per-account totals while they still counted towards the budget. The
 * server enforces that; this offers archive first so it rarely comes up.
 */
export default function AccountsSheet({ open, onClose }) {
  const { accounts, addAccount, updateAccount, removeAccount } = useAccounts();
  const toast = useToast();
  const guard = useDemoGuard();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(CUSTOM_COLOR_OPTIONS[0]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Id of the account awaiting an inline "really delete?" confirmation.
  const [confirmId, setConfirmId] = useState(null);

  const reset = () => {
    setAdding(false);
    setName("");
    setColor(CUSTOM_COLOR_OPTIONS[0]);
    setError("");
  };

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the account a name.");
    if (guard()) return;
    setSaving(true);
    try {
      await addAccount({ name: trimmed, color });
      reset();
      toast.success(`Added ${trimmed}`);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't add that account.");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (account) => {
    if (guard()) return;
    try {
      await updateAccount(account.id, { archived: !account.archived });
      toast.info(
        account.archived ? `${account.name} is back` : `Archived ${account.name}`
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't update that account.");
    }
  };

  const handleDelete = async (account) => {
    if (guard()) return;
    try {
      await removeAccount(account.id);
      setConfirmId(null);
      toast.info(`Removed ${account.name}`);
    } catch (err) {
      setConfirmId(null);
      // The server refuses once an account has history; say so rather than
      // failing silently, and point at the archive button right beside it.
      toast.error(
        err?.response?.data?.message || "Couldn't remove that account."
      );
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Bank accounts">
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-ink-3">
          Tag each entry with the account it came from or went into. Your budget
          still covers everything together — this is about where the money sits.
        </p>

        {accounts.length > 0 && (
          <ul className="space-y-1.5">
            {accounts.map((a) => (
              <li
                key={a.id}
                className={`flex items-center justify-between gap-2 rounded-lg border border-hairline p-2.5 ${
                  a.archived ? "opacity-60" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-3 w-3 shrink-0 rounded-[4px]"
                    style={{ background: a.color }}
                  />
                  <span className="truncate text-sm font-medium">{a.name}</span>
                  {a.archived && (
                    <span className="shrink-0 rounded-xs bg-surface-2 px-1.5 py-[3px] text-[11px] font-medium text-ink-2">
                      Archived
                    </span>
                  )}
                </span>

                {confirmId === a.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDelete(a)}
                      aria-label={`Confirm removing ${a.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-sm text-negative transition-colors duration-base ease-out hover:bg-negative/[0.08]"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      aria-label="Cancel"
                      className="flex h-8 w-8 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-surface-2"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleArchive(a)}
                      aria-label={
                        a.archived ? `Restore ${a.name}` : `Archive ${a.name}`
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-surface-2 hover:text-ink"
                    >
                      {a.archived ? (
                        <ArchiveRestore className="h-4 w-4" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(a.id)}
                      aria-label={`Remove ${a.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-negative/[0.08] hover:text-negative"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <div className="space-y-3 rounded-lg border border-hairline bg-surface-2 p-3">
            <div className="space-y-2">
              <Label htmlFor="account-name">Account name</Label>
              <Input
                id="account-name"
                placeholder="e.g. Trust"
                value={name}
                maxLength={24}
                autoFocus
                aria-invalid={Boolean(error)}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
              />
              {error && <FieldError id="account-error">{error}</FieldError>}
            </div>
            <div className="flex flex-wrap gap-2">
              {CUSTOM_COLOR_OPTIONS.map((col) => (
                <button
                  type="button"
                  key={col}
                  onClick={() => setColor(col)}
                  aria-label={`Colour ${col}`}
                  aria-pressed={color === col}
                  className={`h-8 w-8 rounded-sm border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                    color === col ? "border-foreground" : "border-transparent"
                  }`}
                  style={{ backgroundColor: col }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleAdd}
                disabled={!name.trim() || saving}
                className="flex-1"
              >
                {saving ? "Adding…" : "Add account"}
              </Button>
              <Button type="button" variant="outline" onClick={reset}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAdding(true)}
            className="w-full gap-1.5"
          >
            <Plus className="h-4 w-4" /> Add an account
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}
