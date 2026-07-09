'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function NavBar() {
  const { participant, logout } = useAuth();

  return (
    <nav>
      <Link href="/">🏌️ Quiniela</Link>
      {participant && (
        <>
          <Link href="/draft">Mi equipo</Link>
          <Link href="/reemplazo">Reemplazos</Link>
          {participant.isAdmin && <Link href="/capture">Capturar resultados</Link>}
          <Link href="/simulacion">Simulación</Link>
          <Link href="/leaderboard">Tabla</Link>
          {participant.isAdmin && <Link href="/admin">Admin</Link>}
          <span style={{ marginLeft: 'auto', color: 'white', fontSize: 14 }}>
            {participant.name}{' '}
            <button onClick={logout} style={{ padding: '2px 8px', fontSize: 12 }}>
              Salir
            </button>
          </span>
        </>
      )}
    </nav>
  );
}
