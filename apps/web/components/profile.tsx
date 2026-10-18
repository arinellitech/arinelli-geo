import { currentRole, getFacts } from '../lib/facts';
import { COPY, HOME, LLMS, localize, otherLocale, type Locale } from '../lib/i18n';

/**
 * A ficha pública, em pt-BR (/) ou inglês (/en). HTML semântico e literal — é o que
 * crawlers de IA e busca vão indexar. Sem JS no cliente, sem animação, sem texto escondido.
 */
export function Profile({ locale }: { locale: Locale }) {
  const raw = getFacts();
  const f = localize(raw, locale);
  const c = COPY[locale];
  const other = otherLocale(locale);
  const role = currentRole(f);
  const profiles = Object.entries(f.profiles).filter(([, u]) => !u.includes('TODO'));

  return (
    <main>
      <p className="lang">
        <a href={HOME[other]} hrefLang={other} lang={other} rel="alternate">
          {COPY[other].languageName}
        </a>
      </p>

      <header>
        <h1>{f.person.name}</h1>
        <p className="lede">{f.person.headline}</p>
        {locale === 'pt-BR' && raw.person.headline_en && (
          <p className="lede muted" lang="en">
            {raw.person.headline_en}
          </p>
        )}
        <p className="meta">
          {f.person.location.city}, {f.person.location.country}
          {role ? <> · {c.roleAt(role.role, role.org)}</> : null}
          {f.person.since ? <> · {c.since(f.person.since.slice(0, 4))}</> : null}
        </p>
        {profiles.length > 0 && (
          <nav aria-label={c.profiles}>
            <ul className="inline">
              {profiles.map(([name, url]) => (
                <li key={name}>
                  <a href={url} rel="me">
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <section id={c.expertise.id}>
        <h2>{c.expertise.title}</h2>
        <ul>
          {f.expertise.domains.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <p className="muted">Stack: {f.expertise.stack.join(' · ')}</p>
      </section>

      <section id={c.projects.id}>
        <h2>{c.projects.title}</h2>
        <dl>
          {f.projects.map((p) => (
            <div key={p.name}>
              <dt>{p.url && !p.url.includes('TODO') ? <a href={p.url}>{p.name}</a> : p.name}</dt>
              <dd>{p.summary}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id={c.experience.id}>
        <h2>{c.experience.title}</h2>
        <dl>
          {f.experience.map((e) => (
            <div key={`${e.org}-${e.period}`}>
              <dt>
                {e.role} · {e.org} <span className="muted">({e.period})</span>
              </dt>
              <dd>
                {e.summary}
                {e.scale ? <> {c.scale}: {e.scale}.</> : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section id={c.education.id}>
        <h2>{c.education.title}</h2>
        <ul>
          {f.education.map((e) => (
            <li key={e.degree}>
              {e.degree} — {e.institution}
              {e.period ? ` (${e.period})` : ''}
            </li>
          ))}
        </ul>
        <p className="muted">
          {c.languages}: {f.person.languages.map((l) => `${l.name} (${l.level})`).join(', ')}
        </p>
      </section>

      <footer>
        <p className="muted">
          {c.alsoIn} <a href={LLMS[locale]}>{LLMS[locale]}</a>.
        </p>
      </footer>
    </main>
  );
}
