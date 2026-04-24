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
        <h1>{t.aboutHeroTitle}</h1>
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

      <section className="about-highlights" aria-label={t.aboutHighlightsTitle}>
        <h2>{t.aboutHighlightsTitle}</h2>
        <div className="about-highlights-grid">
          <article className="about-highlight-card">
            <h3>{t.aboutHighlight1Title}</h3>
            <p>{t.aboutHighlight1Body}</p>
          </article>
          <article className="about-highlight-card">
            <h3>{t.aboutHighlight2Title}</h3>
            <p>{t.aboutHighlight2Body}</p>
          </article>
          <article className="about-highlight-card">
            <h3>{t.aboutHighlight3Title}</h3>
            <p>{t.aboutHighlight3Body}</p>
          </article>
        </div>
      </section>

      <div className="about-grid">
        <article className="about-card">
          <h2>{t.aboutWhatWeDoTitle}</h2>
          <div className="about-pill-row">
            <span className="about-pill">{t.aboutPillCataloging}</span>
            <span className="about-pill">{t.aboutPillPreservation}</span>
            <span className="about-pill">{t.aboutPillTracking}</span>
            <span className="about-pill">{t.aboutPillModeration}</span>
          </div>
        </article>

        <article className="about-card">
          <h2>{t.aboutHowToJoinTitle}</h2>
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
        </article>
      </div>

      <article className="about-card">
        <h2>{t.aboutAccessTitle}</h2>
        <div className="about-discord">
          {discordImageUrl ? (
            <img src={discordImageUrl} alt="Discord Comunidad del Manga" />
          ) : (
            <div className="about-pill">Discord</div>
          )}
          <div>
            <p>{t.aboutAccessLead}</p>
            <a className="about-discord-cta" href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
              {t.discordCta}
            </a>
          </div>
        </div>
      </article>

      <article className="about-principles">
        <h2>{t.aboutPrinciplesTitle}</h2>
        <ul>
          <li>{t.aboutPrinciple1}</li>
          <li>{t.aboutPrinciple2}</li>
          <li>{t.aboutPrinciple3}</li>
        </ul>
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
