import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setToken } from "@/api/client";
import { useAuth } from "@/hooks/useAuth";
import BrandLoader from "@/components/BrandLoader";

/** Receives #token=... from the OAuth redirect, stores it, then loads the user. */
export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    // Token arrives in the hash fragment (kept out of server logs); fall back
    // to the query string for any older redirect still in flight.
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const token = hashParams.get("token") || params.get("token");
    window.history.replaceState(null, "", window.location.pathname);
    if (token) {
      setToken(token);
      refresh()
        .then(() => navigate("/", { replace: true }))
        .catch(() => navigate("/login", { replace: true }));
    } else {
      navigate("/login", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <BrandLoader />;
}
