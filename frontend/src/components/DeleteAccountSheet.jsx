import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { deleteAccount } from "@/api/endpoints";

/** The confirmation before an account and everything in it is deleted. */
export default function DeleteAccountSheet({ open, onClose }) {
  const { clearSession } = useAuth();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      // The user row is gone, so the token is already dead — skip the logout
      // call it would 401 on and just clear locally.
      clearSession();
    } catch {
      setDeleting(false);
      toast.error("Couldn't delete account. Please try again.");
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => !deleting && onClose()}
      title="Delete Account"
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-negative" />
          <p className="text-[13px] leading-relaxed text-ink-3">
            This permanently deletes your account, all your transactions and
            your savings history. This <strong>cannot be undone.</strong>
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete Account"}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
