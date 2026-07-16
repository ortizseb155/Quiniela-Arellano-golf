'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { nextPowerOfTwo } from '@/lib/bracket';
import AdminGuard from '@/lib/AdminGuard';

interface Tournament {
  id: string;
  name: string;
  category: string;
  draw_size: number;
  status: string;
}

export default function AdminPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('grand_slam');
  const [drawSize, setDrawSize] = useState(128);

  async function load() {
    const { data } = await supabase
      .from('tournaments')
      .select('id, name, category, draw_size, status')
      .order('created_at', { ascending: false });
    setTournaments(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createTournament() {
    const bracketSize = nextPowerOfTwo(drawSize);
    const { error } = await supabase.from('tournaments').insert({
      name,
      category,
      draw_size: drawSize,
      bracket_size: bracketSize,
      status: 'draft',
    });
    if (!error) {
      setName('');
      load();
    }
  }

  return (
    <AdminGuard>
    <div className="container">
      <h1>Panel de admin</h1>
      <p>
        <a href="/admin/participantes">Gestionar participantes</a>
      </p>

      <div className="card">
        <h3>Crear torneo</h3>
        <input placeholder="Nombre (ej. US Open 2026)" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="grand_slam">Grand Slam</option>
          <option value="masters_1000">Masters 1000</option>
        </select>
        <select value={drawSize} onChange={(e) => setDrawSize(Number(e.target.value))}>
          <option value={128}>128 (Grand Slam)</option>
          <option value={96}>96 (Masters 1000)</option>
          <option value={56}>56 (Masters 1000)</option>
          <option value={64}>64</option>
          <option value={32}>32</option>
        </select>
        <button className="primary" onClick={createTournament} disabled={!name}>
          Crear torneo
        </button>
      </div>

      <h3>Torneos existentes</h3>
      {tournaments.map((t) => (
        <div className="card" key={t.id}>
          <strong>{t.name}</strong> — {t.status}
          <div>
            <Link href={`/admin/${t.id}/draw`}>Cargar draw</Link>
            {' · '}
            <Link href={`/admin/${t.id}/resultados`}>Capturar resultados</Link>
          </div>
        </div>
      ))}
    </div>
    </AdminGuard>
  );
}
