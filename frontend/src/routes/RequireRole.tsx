import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { apiGet } from "../lib/api";
import { AppRole, SessionUser } from "../types";
import { useI18n } from "../lib/i18n";

type Props = {
  allowed: AppRole[];
};

export function RequireRole({ allowed }: Props) {
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
  if (!allowed.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
