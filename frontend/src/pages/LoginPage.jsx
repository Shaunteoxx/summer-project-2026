import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Wallet, Eye, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
  const [demoLoading, setDemoLoading] = useState(false);

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
    <div className="app-bg flex min-h-[100dvh] flex-col items-center justify-center px-5 pb-safe pt-safe">
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="w-full max-w-app"
      >
        <Card className="border-border/70 shadow-2xl">
          <CardContent className="flex flex-col items-center gap-6 p-8 text-center">
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 14 }}
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30"
            >
              <Wallet className="h-8 w-8" />
            </motion.div>

            <div className="space-y-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                Broke No More
              </h1>
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
                Know exactly how much you can spend today and how much you need
                to save for tomorrow.
              </p>
            </div>

            <div className="w-full space-y-3">
              <Button size="lg" className="w-full gap-3" onClick={handleGoogle}>
                <GoogleIcon />
                Sign in with Google
              </Button>

              <Button
                size="lg"
                variant="outline"
                className="w-full gap-2"
                onClick={handleDemo}
                disabled={demoLoading}
              >
                {demoLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                {demoLoading ? "Loading demo…" : "Explore the demo"}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              No sign-up needed · Demo is read-only
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
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
