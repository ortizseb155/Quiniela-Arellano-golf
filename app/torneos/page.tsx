'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

interface Tournament {
  id: string;
  name: string;
  category: string;
  status: string;
}

export default function TorneosPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  useEffect(() => {
    supabase
      .from('tournaments')
      .select('id, name, category, status')
      .order('created_at', { ascending: false })
      .then(({ data }) => setTournaments(data || []));
  }, []);

  return (
    <div className="container">
      <h1>Torneos</h1>
      {tournaments.map((t) => (
        <div className="card" key={t.id}>
          <strong>{t.name}</strong>
          <p style={{ opacity: 0.7 }}>
            {t.category === 'grand_slam' ? 'Grand Slam' : 'Masters 1000'} · {t.status}
          </p>
          <Link href={`/bracket/${t.id}`}>Llenar / ver mi bracket</Link>
          {' · '}
          <Link href={`/leaderboard/${t.id}`}>Ver tabla general</Link>
        </div>
      ))}
      {tournaments.length === 0 && <p>Todavía no hay torneos creados.</p>}
    </div>
  );
}
