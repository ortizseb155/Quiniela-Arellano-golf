'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const { participant, login } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await login(name, pin);
    setLoading(false);
    if (err) setError(err);
    else router.push('/leaderboard');
  }

  if (participant) {
    return (
      <div className="card">
        <h2>¡Hola, {participant.name}! 👋</h2>
        <p className="muted">Usa el menú de arriba para ver tu equipo, capturar resultados o ver la tabla.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Entrar a la quiniela</h2>
      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: 12 }}>
          <label>Nombre<br />
            <input value={name} onChange={e => setName(e.target.value)} required />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>PIN<br />
            <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} required />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
      </form>
      <p className="muted" style={{ marginTop: 12 }}>
        ¿Primera vez? Pídele al admin que te registre con tu nombre y un PIN de 4 dígitos.
      </p>
    </div>
  );
}
