'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { teamTotalPoints, teamRoundPoints, Player, HoleResultRow, Pick } from '@/lib/scoring';

interface Tournament { id: string; name: string; year: number; current_round: number; }
interface ParticipantRow { id: string; name: string; }

interface TeamStanding {
  participantId: string;
  participantName: string;
  total: number;
  roster: { playerName: string; points: number }[];
}

export default function LeaderboardPage() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: tournaments } = await supabase
      .from('tournaments').select('*')
      .in('status', ['in_progress', 'finished'])
      .order('created_at', { ascending: false }).limit(1);
    const t = tournaments?.[0] || null;
    setTournament(t);
    if (!t) { setLoading(false); return; }

    const [{ data: playersData }, { data: picksData }, { data: holesData }, { data: participantsData }] = await Promise.all([
      supabase.from('players').select('*').eq('tournament_id', t.id),
      supabase.from('picks').select('*').eq('tournament_id', t.id),
      supabase.from('hole_results').select('*').eq('tournament_id', t.id),
      supabase.from('participants').select('id, name'),
    ]);

    const players: Player[] = (playersData || []).map(p => ({
      id: p.id, name: p.name, initialPrice: p.initial_price, currentPrice: p.current_price,
      madeCut: p.made_cut, finalPosition: p.final_position, withdrawn: p.withdrawn,
    }));
    const holeResults: HoleResultRow[] = (holesData || []).map(h => ({
      playerId: h.player_id, round: h.round, hole: h.hole, result: h.result,
    }));
    const participants: ParticipantRow[] = participantsData || [];
    const roundsPlayed = Array.from({ length: t.current_round || 0 }, (_, i) => i + 1);

    const byParticipant: Record<string, Pick[]> = {};
    (picksData || []).forEach(pk => {
      const pick: Pick = { participantId: pk.participant_id, playerId: pk.player_id, pricePaid: pk.price_paid, isReplacement: pk.is_replacement };
      byParticipant[pk.participant_id] = byParticipant[pk.participant_id] || [];
      byParticipant[pk.participant_id].push(pick);
    });

    const result: TeamStanding[] = Object.entries(byParticipant).map(([participantId, picks]) => {
      const total = teamTotalPoints(picks, players, holeResults, roundsPlayed);
      const roster = picks.map(pk => {
        const player = players.find(pl => pl.id === pk.playerId);
        const pts = roundsPlayed.reduce((sum, r) => sum + teamRoundPoints([pk], r, holeResults), 0);
        return { playerName: player?.name || '?', points: pts };
      });
      const name = participants.find(p => p.id === participantId)?.name || '?';
      return { participantId, participantName: name, total, roster };
    }).sort((a, b) => b.total - a.total);

    setStandings(result);
    setLoading(false);
  }

  if (loading) return <p>Cargando...</p>;
  if (!tournament) return <p>No hay ningún torneo activo todavía.</p>;

  return (
    <div>
      <h2>Tabla — {tournament.name} (ronda {tournament.current_round})</h2>
      <button onClick={load} style={{ marginBottom: 12 }}>🔄 Actualizar</button>
      {standings.map((s, i) => (
        <div className="card" key={s.participantId}>
          <h3>{i + 1}. {s.participantName} — {s.total} pts</h3>
          <table>
            <thead><tr><th>Golfista</th><th>Puntos</th></tr></thead>
            <tbody>
              {s.roster.sort((a, b) => b.points - a.points).map((r, idx) => (
                <tr key={idx}><td>{r.playerName}</td><td>{r.points}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
