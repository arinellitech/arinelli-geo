import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Página não encontrada · Page not found',
  robots: { index: false, follow: true },
};

/** 404 de qualquer URL sem rota. Há dois root layouts, (pt) e (en), então ele traz o próprio <html>. */
export default function GlobalNotFound() {
  return (
    <html lang="pt-BR">
      <body>
        <main>
          <h1>Página não encontrada</h1>
          <p>
            Este endereço não existe. <a href="/">Ir para a ficha</a>.
          </p>
          <p className="muted" lang="en">
            This address does not exist. <a href="/en">Go to the English profile</a>.
          </p>
        </main>
      </body>
    </html>
  );
}
