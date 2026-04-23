import { useSeo } from "../lib/seo";
import { useI18n } from "../lib/i18n";

export function AboutRepoManPage() {
  const { t, locale } = useI18n();
  const discordImageUrl = (import.meta.env.VITE_DISCORD_IMAGE_URL as string | undefined)?.trim();
  const discordInviteUrl =
    ((import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined)?.trim() || "https://discord.gg/jURmbDXjnf");
  const siteUrl = ((import.meta.env.VITE_SITE_URL as string | undefined)?.trim().replace(/\/$/, "") ||
    "https://repoman.comunidaddelmanga.com");

  useSeo({
    title: "¿Qué es RepoMan?",
    description:
      "Conoce cómo funciona RepoMan para preservar mangas y cómo solicitar tu usuario y contraseña por Discord.",
    path: "/que-es-repoman",
    lang: locale,
    index: true,
    follow: true,
    type: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "¿Qué es RepoMan?",
      inLanguage: locale,
      url: `${siteUrl}/que-es-repoman`,
      isPartOf: {
        "@type": "WebSite",
        name: "RepoMan",
        url: siteUrl
      },
      about: {
        "@type": "Thing",
        name: "Preservación de manga, manhwa y manhua"
      }
    }
  });

  return (
    <section className="about-page">
      <article className="about-hero">
        <span className="about-kicker">REPO ARCHIVE</span>
        <h1>📚 ¿Qué es RepoMan?</h1>
        <p>
          RepoMan es una plataforma de preservación: organizamos metadatos, portadas y respaldo de archivos para que
          obras de manga, manhwa y manhua no se pierdan con el tiempo. El catálogo público muestra información y estado
          de conservación de cada obra.
        </p>
      </article>

      <div className="about-grid">
        <article className="about-card">
          <h2>🧭 ¿Qué hacemos?</h2>
          <div className="about-pill-row">
            <span className="about-pill">Catalogación de obras</span>
            <span className="about-pill">Preservación de respaldo</span>
            <span className="about-pill">Seguimiento de obras faltantes</span>
            <span className="about-pill">Moderación por administradores</span>
          </div>
        </article>

        <article className="about-card">
          <h2>🤝 ¿Cómo participar?</h2>
          <ol className="about-steps">
            <li>
              <strong>Solicita acceso por Discord.</strong> El equipo crea tu cuenta.
            </li>
            <li>
              <strong>Recibe usuario y contraseña.</strong> Con eso puedes iniciar sesión.
            </li>
            <li>
              <strong>Publica obras.</strong> Puedes subir con respaldo o crear solicitud de conservación.
            </li>
          </ol>
        </article>
      </div>

      <article className="about-card">
        <h2>🔐 ¿Cómo solicito acceso como colaborador?</h2>
        <div className="about-discord">
          {discordImageUrl ? (
            <img src={discordImageUrl} alt="Discord Comunidad del Manga" />
          ) : (
            <div className="about-pill">Discord</div>
          )}
          <div>
            <p>
              Si deseas participar como uploader, debes solicitar tu cuenta por Discord. Allí te entregaremos tu
              usuario y contraseña para acceder al panel y colaborar con la conservación.
            </p>
            <a className="about-discord-cta" href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
              {t.discordCta}
            </a>
          </div>
        </div>
      </article>

      <article className="about-final-cta">
        <h2>{t.aboutFinalTitle}</h2>
        <p>{t.aboutFinalLead}</p>
        <a className="about-discord-cta strong" href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
          {t.aboutFinalCta}
        </a>
      </article>
    </section>
  );
}
