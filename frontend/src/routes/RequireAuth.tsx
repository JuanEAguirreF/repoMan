import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { apiGet } from "../lib/api";
import { SessionUser } from "../types";
import { useI18n } from "../lib/i18n";

export function RequireAuth() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    apiGet<{ user: SessionUser }>("/auth/session", true)
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>{t.loading}</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
