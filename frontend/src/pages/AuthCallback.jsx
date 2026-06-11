import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setToken } from "@/api/client";
import { useAuth } from "@/hooks/useAuth";
import BrandLoader from "@/components/BrandLoader";

/** Receives ?token=... from the OAuth redirect, stores it, then loads the user. */
export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    const token = params.get("token");
    if (token) {
      setToken(token);
      refresh().then(() => navigate("/", { replace: true }));
    } else {
      navigate("/login", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <BrandLoader />;
}
