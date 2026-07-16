'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { MatchRow, computeScore } from '@/lib/bracket';

interface Row {
  name: string;
  total: number;
}

export default function LeaderboardPage() {
  const { id } = useParams<{ id: string }>();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    async function load() {
      const { data: matchData } = await supabase.from('matches').select('*').eq('tournament_id', id);
      const matches: MatchRow[] = matchData || [];

      const { data: participants } = await supabase.from('participants').select('id, name');
      const { data: allPicks } = await supabase
        .from('picks')
        .select('participant_id, match_id, picked_slot')
        .in('match_id', matches.map((m) => m.id));

      const results: Row[] = (participants || []).map((p: any) => {
        const picksMap: Record<string, number> = {};
        (allPicks || [])
          .filter((pk: any) => pk.participant_id === p.id)
          .forEach((pk: any) => (picksMap[pk.match_id] = pk.picked_slot));
        const { total } = computeScore(matches, picksMap);
        return { name: p.name, total };
      });

      results.sort((a, b) => b.total - a.total);
      setRows(results);
    }
    load();
  }, [id]);

  return (
    <div className="container">
      <h1>Tabla general</h1>
      {rows.map((r, i) => (
        <div className="card" key={r.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>
            {i + 1}. {r.name}
          </span>
          <strong>{r.total} pts</strong>
        </div>
      ))}
    </div>
  );
}
