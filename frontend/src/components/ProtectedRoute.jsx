import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import BrandLoader from "@/components/BrandLoader";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <BrandLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
