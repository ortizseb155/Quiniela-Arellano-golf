'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { MatchRow, resolveParticipantOptions, numRounds } from '@/lib/bracket';

interface DrawEntry {
  slot_number: number;
  player_name: string | null;
  is_bye: boolean;
  country?: string | null;
  status?: string | null;
}

const ROUND_NAMES: Record<number, string> = {};

export default function BracketPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [draw, setDraw] = useState<Record<number, DrawEntry>>({});
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [tournamentStatus, setTournamentStatus] = useState('open');
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const pid = localStorage.getItem('participant_id');
    if (!pid) {
      router.push('/login');
      return;
    }
    setParticipantId(pid);

    async function load() {
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('status')
        .eq('id', id)
        .single();
      if (tournament) setTournamentStatus(tournament.status);

      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', id)
        .order('round', { ascending: true })
        .order('match_number', { ascending: true });
      setMatches(matchData || []);

      const { data: drawData } = await supabase
        .from('draw_entries')
        .select('*')
        .eq('tournament_id', id);
      const drawMap: Record<number, DrawEntry> = {};
      (drawData || []).forEach((d: DrawEntry) => (drawMap[d.slot_number] = d));
      setDraw(drawMap);

      const { data: pickData } = await supabase
        .from('picks')
        .select('match_id, picked_slot')
        .eq('participant_id', pid);
      const pickMap: Record<string, number> = {};
      (pickData || []).forEach((p: any) => (pickMap[p.match_id] = p.picked_slot));
      setPicks(pickMap);
    }

    load();
  }, [id, router]);

  function slotLabel(slot: number | null): string {
    if (slot == null) return 'Pendiente';
    const entry = draw[slot];
    if (!entry) return 'Bye';
    if (!entry.player_name) return 'Bye';
    const extras = [entry.country, entry.status].filter(Boolean).join(' · ');
    return extras ? `${entry.player_name} (${extras})` : entry.player_name;
  }

  function choosePick(matchId: string, slot: number) {
    if (tournamentStatus !== 'open') return;
    setPicks((prev) => ({ ...prev, [matchId]: slot }));
  }

  async function submitBracket() {
    if (!participantId) return;
    setSaving(true);
    const rows = Object.entries(picks).map(([match_id, picked_slot]) => ({
      participant_id: participantId,
      match_id,
      picked_slot,
    }));
    await supabase.from('picks').upsert(rows, { onConflict: 'participant_id,match_id' });
    setSaving(false);
    alert('¡Bracket guardado!');
  }

  const options = resolveParticipantOptions(matches, picks);
  const rounds = matches.length ? numRounds(matches.filter((m) => m.round === 1).length * 2) : 0;

  return (
    <div className="container">
      <h1>Llenar bracket</h1>
      {tournamentStatus !== 'open' && (
        <p style={{ color: '#facc15' }}>Este torneo ya no acepta cambios en los picks.</p>
      )}
      {Array.from({ length: rounds }, (_, i) => i + 1).map((round) => (
        <div key={round}>
          <h3>Ronda {round}</h3>
          {matches
            .filter((m) => m.round === round)
            .map((m) => {
              const opt = options[m.id];
              const picked = picks[m.id];
              return (
                <div className="card" key={m.id}>
                  <div
                    className={`match-option ${picked === opt.optionA ? 'selected' : ''}`}
                    onClick={() => opt.optionA != null && choosePick(m.id, opt.optionA)}
                  >
                    {slotLabel(opt.optionA)}
                  </div>
                  <div
                    className={`match-option ${picked === opt.optionB ? 'selected' : ''}`}
                    onClick={() => opt.optionB != null && choosePick(m.id, opt.optionB)}
                  >
                    {slotLabel(opt.optionB)}
                  </div>
                </div>
              );
            })}
        </div>
      ))}
      {tournamentStatus === 'open' && (
        <button className="primary" onClick={submitBracket} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar mi bracket'}
        </button>
      )}
    </div>
  );
}
