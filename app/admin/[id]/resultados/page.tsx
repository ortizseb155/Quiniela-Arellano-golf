'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { MatchRow, resolveParticipantOptions, numRounds } from '@/lib/bracket';
import AdminGuard from '@/lib/AdminGuard';

interface DrawEntry {
  slot_number: number;
  player_name: string | null;
  is_bye: boolean;
  country?: string | null;
  status?: string | null;
}

export default function ResultadosPage() {
  const { id } = useParams<{ id: string }>();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [draw, setDraw] = useState<Record<number, DrawEntry>>({});

  async function load() {
    const { data: matchData } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', id)
      .order('round', { ascending: true })
      .order('match_number', { ascending: true });
    setMatches(matchData || []);

    const { data: drawData } = await supabase.from('draw_entries').select('*').eq('tournament_id', id);
    const drawMap: Record<number, DrawEntry> = {};
    (drawData || []).forEach((d: DrawEntry) => (drawMap[d.slot_number] = d));
    setDraw(drawMap);
  }

  useEffect(() => {
    load();
  }, [id]);

  function slotLabel(slot: number | null): string {
    if (slot == null) return 'Pendiente';
    const entry = draw[slot];
    if (!entry) return 'Bye';
    if (!entry.player_name) return 'Bye';
    const extras = [entry.country, entry.status].filter(Boolean).join(' · ');
    return extras ? `${entry.player_name} (${extras})` : entry.player_name;
  }

  async function setWinner(matchId: string, slot: number) {
    await supabase.from('matches').update({ winner_slot: slot }).eq('id', matchId);
    await supabase.from('tournaments').update({ status: 'in_progress' }).eq('id', id);
    load();
  }

  // Los "picks" reales ya decididos = winner_slot de los partidos ya jugados
  const realResults: Record<string, number> = {};
  matches.forEach((m) => {
    if (m.winner_slot != null) realResults[m.id] = m.winner_slot;
  });
  const options = resolveParticipantOptions(matches, realResults);
  const rounds = matches.length ? numRounds(matches.filter((m) => m.round === 1).length * 2) : 0;

  return (
    <AdminGuard>
    <div className="container">
      <h1>Capturar resultados reales</h1>
      {Array.from({ length: rounds }, (_, i) => i + 1).map((round) => (
        <div key={round}>
          <h3>Ronda {round}</h3>
          {matches
            .filter((m) => m.round === round)
            .map((m) => {
              const opt = options[m.id];
              return (
                <div className="card" key={m.id}>
                  <div
                    className={`match-option ${m.winner_slot === opt.optionA ? 'selected' : ''}`}
                    onClick={() => opt.optionA != null && setWinner(m.id, opt.optionA)}
                  >
                    {slotLabel(opt.optionA)}
                  </div>
                  <div
                    className={`match-option ${m.winner_slot === opt.optionB ? 'selected' : ''}`}
                    onClick={() => opt.optionB != null && setWinner(m.id, opt.optionB)}
                  >
                    {slotLabel(opt.optionB)}
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </div>
    </AdminGuard>
  );
}
