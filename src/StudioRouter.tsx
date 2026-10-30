import { lazy, Suspense } from 'react';

const App = lazy(() => import('./App'));
const EventCardEditor = lazy(() => import('./cards/EventCardEditor'));

export default function StudioRouter() {
  const cardsRoute = window.location.pathname.replace(/\/+$/, '') === '/cards';
  return (
    <Suspense fallback={<p>Editor wird geladen…</p>}>
      {cardsRoute ? <EventCardEditor /> : <App />}
    </Suspense>
  );
}
