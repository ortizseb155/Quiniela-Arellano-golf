'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

interface Participant {
  id: string;
  name: string;
}

export default function LoginPage() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    supabase
      .from('participants')
      .select('id, name')
      .order('name')
      .then(({ data }) => setParticipants(data || []));
  }, []);

  async function handleLogin() {
    setError('');
    if (!selectedId) {
      setError('Elige tu nombre de la lista');
      return;
    }

    const { data, error } = await supabase
      .from('participants')
      .select('id, name, pin')
      .eq('id', selectedId)
      .maybeSingle();

    if (error || !data || data.pin !== pin) {
      setError('PIN incorrecto');
      return;
    }

    localStorage.setItem('participant_id', data.id);
    localStorage.setItem('participant_name', data.name);
    router.push('/torneos');
  }

  return (
    <div className="container">
      <h1>Entrar</h1>
      <div className="card">
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Selecciona tu nombre</option>
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Tu PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          type="password"
        />
        <button className="primary" onClick={handleLogin}>
          Entrar
        </button>
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
      </div>
    </div>
  );
}
