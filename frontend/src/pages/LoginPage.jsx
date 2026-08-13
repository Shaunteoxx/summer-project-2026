import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { setToken } from "@/api/client";
import { demoLogin } from "@/api/endpoints";
import { EASE } from "@/animations/variants";

export default function LoginPage() {
  const { user, loading, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    if (params.get("error") === "oauth") {
      toast.error("Google sign-in could not be completed. Please try again.");
      navigate("/login", { replace: true });
    }
  }, [navigate, params, toast]);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const handleGoogle = () => {
    window.location.href = `${import.meta.env.VITE_API_URL || ""}/api/auth/google`;
  };

  const handleDemo = async () => {
    setDemoLoading(true);
    try {
      const { token } = await demoLogin();
      setToken(token);
      await refresh();
      navigate("/", { replace: true });
    } catch {
      setDemoLoading(false);
      toast.error("Couldn't start the demo. Please try again.");
    }
  };

  return (
    // Left-aligned and uncarded. A card here framed the only thing on the
    // screen, which is what made this read as a dialog rather than as the front
    // door — and the app behind it has no card wrapping a whole page either.
    // The column is capped near the mockup's 326px measure so the headline
    // keeps its three-line shape on a phone and doesn't stretch on a desktop.
    <div className="flex min-h-[100dvh] flex-col justify-center bg-canvas px-8 pb-safe pt-safe">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="mx-auto w-full max-w-[22rem]"
      >
        {/* The wordmark, not a wallet icon: this is the one screen where the
            brand is the subject, and the same mark the cold-start loader
            shows — so the app doesn't introduce itself twice with two
            different faces. */}
        <div
          role="img"
          aria-label="Broke No More"
          className="grid h-14 w-14 place-items-center rounded-[18px] bg-ink text-[28px] font-semibold tracking-[-0.05em] text-surface"
        >
          B
        </div>

        {/* The headline is the promise, not the product name. Someone who has
            just landed needs to know what this does; the name is on the mark
            above and in the tab. */}
        <h1 className="mt-[26px] text-[30px] font-semibold leading-[1.15] tracking-[-0.03em]">
          Know exactly what you can spend today.
        </h1>
        <p className="mt-3.5 text-[14.5px] leading-relaxed text-ink-3">
          Set a savings target, log what you spend, and the app works out the
          rest — one number, every day.
        </p>

        <div className="mt-9 flex flex-col gap-2.5">
          <Button className="h-[50px] w-full gap-3" onClick={handleGoogle}>
            <GoogleIcon />
            Continue with Google
          </Button>

          {/* Filled surface-2 rather than an outline: two outlined buttons
              stacked read as equal choices, and signing in is the one that
              keeps your data. */}
          <Button
            variant="secondary"
            className="h-[50px] w-full gap-2"
            onClick={handleDemo}
            disabled={demoLoading}
          >
            {demoLoading ? (
              <Loader2 className="h-[17px] w-[17px] animate-spin" />
            ) : (
              <Eye className="h-[17px] w-[17px]" />
            )}
            {demoLoading ? "Loading demo…" : "Try the demo"}
          </Button>
        </div>

        <p className="mt-[22px] text-center text-[11.5px] leading-relaxed text-ink-3">
          The demo is read-only. Nothing you do in it is saved.
        </p>
      </motion.div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
