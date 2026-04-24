import { useSeo } from "../lib/seo";
import { useI18n } from "../lib/i18n";
import { Link } from "react-router-dom";

export function AboutRepoManPage() {
  const { t, locale } = useI18n();
  const discordImageUrl = (import.meta.env.VITE_DISCORD_IMAGE_URL as string | undefined)?.trim();
  const discordInviteUrl =
    ((import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined)?.trim() || "https://discord.gg/jURmbDXjnf");
  const siteUrl = ((import.meta.env.VITE_SITE_URL as string | undefined)?.trim().replace(/\/$/, "") ||
    "https://repoman.comunidaddelmanga.com");

  useSeo({
    title: t.aboutSeoTitle,
    description: t.aboutSeoDescription,
    path: "/que-es-repoman",
    lang: locale,
    index: true,
    follow: true,
    type: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "AboutPage",
        name: t.aboutSeoTitle,
        inLanguage: locale,
        url: `${siteUrl}/que-es-repoman`,
        isPartOf: {
          "@type": "WebSite",
          name: "RepoMan",
          url: siteUrl
        },
        about: {
          "@type": "Thing",
          name: locale === "es" ? "Preservación de manga, manhwa y manhua" : "Manga, manhwa, and manhua preservation"
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: t.navPublicCatalog,
            item: `${siteUrl}/`
          },
          {
            "@type": "ListItem",
            position: 2,
            name: t.navAbout,
            item: `${siteUrl}/que-es-repoman`
          }
        ]
      }
    ]
  });

  return (
    <section className="about-page">
      <article className="about-hero">
        <span className="about-kicker">REPO ARCHIVE</span>
        <h1>{locale === "es" ? "📚 ¿Qué es RepoMan?" : "📚 What is RepoMan?"}</h1>
        <p>{t.aboutHeroLead}</p>
        <div className="about-hero-actions">
          <a className="about-discord-cta strong" href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
            {t.aboutHeroPrimaryCta}
          </a>
          <Link className="about-discord-cta ghost" to="/faq">
            {t.aboutHeroSecondaryCta}
          </Link>
        </div>
        <div className="about-hero-stats" role="list">
          <div className="about-hero-stat" role="listitem">
            <span>{t.aboutHeroStat1Label}</span>
            <strong>{t.aboutHeroStat1Value}</strong>
          </div>
          <div className="about-hero-stat" role="listitem">
            <span>{t.aboutHeroStat2Label}</span>
            <strong>{t.aboutHeroStat2Value}</strong>
          </div>
          <div className="about-hero-stat" role="listitem">
            <span>{t.aboutHeroStat3Label}</span>
            <strong>{t.aboutHeroStat3Value}</strong>
          </div>
        </div>
      </article>

      <div className="about-grid">
        <article className="about-card">
          <h2 className="about-heading">
            <span aria-hidden="true" className="about-heading-icon">
              🧩
            </span>
            {locale === "es" ? "¿Qué hacemos?" : "What do we do?"}
          </h2>
          <div className="about-pill-row">
            <span className="about-pill">{t.aboutPillCataloging}</span>
            <span className="about-pill">{t.aboutPillPreservation}</span>
            <span className="about-pill">{t.aboutPillTracking}</span>
            <span className="about-pill">{t.aboutPillModeration}</span>
          </div>
        </article>

        <article className="about-card">
          <h2 className="about-heading">
            <span aria-hidden="true" className="about-heading-icon">
              🤝
            </span>
            {locale === "es" ? "¿Cómo participar?" : "How can I join?"}
          </h2>
          <ol className="about-steps">
            <li>
              <strong>{t.aboutStep1Title}</strong> {t.aboutStep1Body}
            </li>
            <li>
              <strong>{t.aboutStep2Title}</strong> {t.aboutStep2Body}
            </li>
            <li>
              <strong>{t.aboutStep3Title}</strong> {t.aboutStep3Body}
            </li>
          </ol>
          <p className="about-join-note">{t.aboutAccessLead}</p>
          <a className="about-discord-cta" href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
            {t.discordCta}
          </a>
        </article>
      </div>

      <article className="about-principles">
        <h2 className="about-heading">
          <span aria-hidden="true" className="about-heading-icon">
            🛡️
          </span>
          {locale === "es" ? "¿Qué reglas seguimos?" : "Which principles guide us?"}
        </h2>
        <ul className="about-principles-list">
          <li>{t.aboutPrinciple1}</li>
          <li>{t.aboutPrinciple2}</li>
          <li>{t.aboutPrinciple3}</li>
        </ul>
      </article>

      <article className="about-final-cta">
        <h2 className="about-heading">
          <span aria-hidden="true" className="about-heading-icon">
            🚀
          </span>
          {locale === "es" ? "¿Te sumas al proyecto?" : "Ready to collaborate?"}
        </h2>
        <p>{t.aboutFinalLead}</p>
        <div className="about-final-row">
          {discordImageUrl ? (
            <img src={discordImageUrl} alt="Discord Comunidad del Manga" className="about-final-discord-image" />
          ) : null}
          <a className="about-discord-cta strong" href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
            {t.aboutFinalCta}
          </a>
        </div>
      </article>
    </section>
  );
}
