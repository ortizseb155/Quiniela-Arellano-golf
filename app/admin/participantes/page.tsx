'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AdminGuard from '@/lib/AdminGuard';

interface Participant {
  id: string;
  name: string;
  pin: string;
}

export default function ParticipantesPage() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');

  async function load() {
    const { data } = await supabase.from('participants').select('*').order('name');
    setParticipants(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function addParticipant() {
    if (participants.length >= 20) {
      alert('Ya hay 20 participantes registrados (el máximo de esta quiniela).');
      return;
    }
    await supabase.from('participants').insert({ name, pin });
    setName('');
    setPin('');
    load();
  }

  return (
    <AdminGuard>
    <div className="container">
      <h1>Participantes ({participants.length}/20)</h1>
      <div className="card">
        <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
        <button className="primary" onClick={addParticipant} disabled={!name || !pin}>
          Agregar participante
        </button>
      </div>
      {participants.map((p) => (
        <div className="card" key={p.id}>
          {p.name} — PIN: {p.pin}
        </div>
      ))}
    </div>
    </AdminGuard>
  );
}
