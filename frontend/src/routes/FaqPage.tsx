import { useSeo } from "../lib/seo";
import { useI18n } from "../lib/i18n";

export function FaqPage() {
  const { t, locale } = useI18n();

  useSeo({
    title: t.faqTitle,
    description: t.faqLead,
    path: "/faq",
    lang: locale,
    index: true,
    follow: true,
    type: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: t.faqQ1, acceptedAnswer: { "@type": "Answer", text: t.faqA1 } },
        { "@type": "Question", name: t.faqQ2, acceptedAnswer: { "@type": "Answer", text: t.faqA2 } },
        { "@type": "Question", name: t.faqQ3, acceptedAnswer: { "@type": "Answer", text: t.faqA3 } },
        { "@type": "Question", name: t.faqQ4, acceptedAnswer: { "@type": "Answer", text: t.faqA4 } },
        { "@type": "Question", name: t.faqQ5, acceptedAnswer: { "@type": "Answer", text: t.faqA5 } },
        { "@type": "Question", name: t.faqQ6, acceptedAnswer: { "@type": "Answer", text: t.faqA6 } }
      ]
    }
  });

  const faqs = [
    { q: t.faqQ1, a: t.faqA1 },
    { q: t.faqQ2, a: t.faqA2 },
    { q: t.faqQ3, a: t.faqA3 },
    { q: t.faqQ4, a: t.faqA4 },
    { q: t.faqQ5, a: t.faqA5 },
    { q: t.faqQ6, a: t.faqA6 }
  ];

  return (
    <section className="faq-page">
      <article className="faq-hero">
        <span className="about-kicker">FAQ</span>
        <h1>{t.faqTitle}</h1>
        <p>{t.faqLead}</p>
      </article>
      <div className="faq-grid">
        {faqs.map((item) => (
          <article key={item.q} className="faq-card">
            <h2>{item.q}</h2>
            <p>{item.a}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
