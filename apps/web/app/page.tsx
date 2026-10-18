import { currentRole, getFacts } from '../lib/facts';

export const dynamic = 'force-static';

/**
 * Página inicial = a ficha pública. HTML semântico e literal — é o que crawlers
 * de IA e busca vão indexar. Sem JS no cliente, sem animação, sem texto escondido.
 */
export default function HomePage() {
  const f = getFacts();
  const role = currentRole(f);
  const profiles = Object.entries(f.profiles).filter(([, u]) => !u.includes('TODO'));

  return (
    <main>
      <header>
        <h1>{f.person.name}</h1>
        <p className="lede">{f.person.headline}</p>
        {f.person.headline_en && (
          <p className="lede muted" lang="en">
            {f.person.headline_en}
          </p>
        )}
        <p className="meta">
          {f.person.location.city}, {f.person.location.country}
          {role ? <> · {role.role} na {role.org}</> : null}
          {f.person.since ? <> · engenharia de software desde {f.person.since.slice(0, 4)}</> : null}
        </p>
        {profiles.length > 0 && (
          <nav aria-label="Perfis">
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

      <section id="especialidades">
        <h2>Especialidades</h2>
        <ul>
          {f.expertise.domains.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <p className="muted">Stack: {f.expertise.stack.join(' · ')}</p>
      </section>

      <section id="projetos">
        <h2>Projetos</h2>
        <dl>
          {f.projects.map((p) => (
            <div key={p.name}>
              <dt>{p.url && !p.url.includes('TODO') ? <a href={p.url}>{p.name}</a> : p.name}</dt>
              <dd>{p.summary}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="experiencia">
        <h2>Experiência</h2>
        <dl>
          {f.experience.map((e) => (
            <div key={`${e.org}-${e.period}`}>
              <dt>
                {e.role} · {e.org} <span className="muted">({e.period})</span>
              </dt>
              <dd>
                {e.summary}
                {e.scale ? <> Escala: {e.scale}.</> : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="formacao">
        <h2>Formação e idiomas</h2>
        <ul>
          {f.education.map((e) => (
            <li key={e.degree}>
              {e.degree} — {e.institution}
              {e.period ? ` (${e.period})` : ''}
            </li>
          ))}
        </ul>
        <p className="muted">Idiomas: {f.person.languages.map((l) => `${l.name} (${l.level})`).join(', ')}</p>
      </section>

      <footer>
        <p className="muted">
          Fatos desta página também estão em <a href="/llms.txt">/llms.txt</a>.
        </p>
      </footer>
    </main>
  );
}
