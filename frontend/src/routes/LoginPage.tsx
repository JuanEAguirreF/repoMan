import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useSeo } from "../lib/seo";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t, locale } = useI18n();
  const loginImageUrl = (import.meta.env.VITE_LOGIN_IMAGE_URL as string | undefined)?.trim();

  useSeo({
    title: t.loginTitle,
    description: t.loginLead,
    path: "/login",
    lang: locale,
    index: false,
    follow: false
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setIsSubmitting(false);
      return;
    }
    navigate("/dashboard/files");
  }

  return (
    <section className="login-page">
      <div className="login-image-panel" aria-hidden={!loginImageUrl}>
        {loginImageUrl ? <img src={loginImageUrl} alt="" className="login-image" /> : <div className="login-image-fallback" />}
      </div>
      <div className="login-card">
        <p className="login-kicker">{t.loginTitle}</p>
        <h2>{t.loginCardTitle}</h2>
        <p className="login-lead">{t.loginLead}</p>
        <form onSubmit={onSubmit} className="login-form">
          <label htmlFor="login-email">{t.loginEmail}</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder={t.loginEmailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="login-password">{t.loginPassword}</label>
          <input
            id="login-password"
            placeholder={t.loginPasswordPlaceholder}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? `${t.loginAction}...` : t.loginAction}
          </button>
        </form>
        {error && <p className="login-error">{`${t.loginErrorPrefix} ${error}`}</p>}
      </div>
    </section>
  );
}
