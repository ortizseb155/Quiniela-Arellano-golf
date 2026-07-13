'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { teamTotalPoints, teamRoundPoints, playerRoundHolePoints, finishBonus, BONUS, Player, HoleResultRow, Pick } from '@/lib/scoring';

interface Tournament { id: string; name: string; year: number; current_round: number; }
interface ParticipantRow { id: string; name: string; }

interface TeamStanding {
  participantId: string;
  participantName: string;
  total: number;
  roundTotals: { round1: number; round2: number; round3: number; round4: number; cutBonus: number; finishBonus: number };
  roster: {
    playerName: string;
    round1: number;
    round2: number;
    round3: number;
    round4: number;
    countsRound3: boolean;
    countsRound4: boolean;
    cutBonus: number;
    finishBonus: number;
    total: number;
  }[];
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
        const round1 = playerRoundHolePoints(pk.playerId, 1, holeResults);
        const round2 = playerRoundHolePoints(pk.playerId, 2, holeResults);
        const round3 = playerRoundHolePoints(pk.playerId, 3, holeResults);
        const round4 = playerRoundHolePoints(pk.playerId, 4, holeResults);
        const cutBonus = (!pk.isReplacement && player?.madeCut) ? BONUS.madeCut : 0;
        const finBonus = (!pk.isReplacement && player) ? finishBonus(player) : 0;
        return {
          playerName: player?.name || '?',
          round1, round2, round3, round4,
          cutBonus, finishBonus: finBonus,
        };
      });

      // ¿Quién está en el top 4 de la ronda 3 / ronda 4? Solo esos cuentan para el equipo Y para su propio total.
      const round3Top4Idx = new Set([...roster].map((r, idx) => ({ idx, pts: r.round3 })).sort((a, b) => b.pts - a.pts).slice(0, 4).map(x => x.idx));
      const round4Top4Idx = new Set([...roster].map((r, idx) => ({ idx, pts: r.round4 })).sort((a, b) => b.pts - a.pts).slice(0, 4).map(x => x.idx));

      const finalRoster = roster.map((r, idx) => {
        const countsRound3 = round3Top4Idx.has(idx);
        const countsRound4 = round4Top4Idx.has(idx);
        const total = r.round1 + r.round2 + (countsRound3 ? r.round3 : 0) + (countsRound4 ? r.round4 : 0) + r.cutBonus + r.finishBonus;
        return { ...r, countsRound3, countsRound4, total };
      });
      const roundTotals = {
        round1: teamRoundPoints(picks, 1, holeResults),
        round2: teamRoundPoints(picks, 2, holeResults),
        round3: teamRoundPoints(picks, 3, holeResults),
        round4: teamRoundPoints(picks, 4, holeResults),
        cutBonus: finalRoster.reduce((sum, r) => sum + r.cutBonus, 0),
        finishBonus: finalRoster.reduce((sum, r) => sum + r.finishBonus, 0),
      };
      const name = participants.find(p => p.id === participantId)?.name || '?';
      return { participantId, participantName: name, total, roundTotals, roster: finalRoster };
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
            <thead>
              <tr>
                <th>Golfista</th>
                <th>R1</th>
                <th>R2</th>
                <th>R3</th>
                <th>R4</th>
                <th>Corte</th>
                <th>Bono</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {s.roster.sort((a, b) => b.total - a.total).map((r, idx) => (
                <tr key={idx}>
                  <td>{r.playerName}</td>
                  <td>{r.round1}</td>
                  <td>{r.round2}</td>
                  <td style={r.countsRound3 ? {} : { textDecoration: 'line-through', color: '#b3261e' }}>{r.round3}</td>
                  <td style={r.countsRound4 ? {} : { textDecoration: 'line-through', color: '#b3261e' }}>{r.round4}</td>
                  <td>{r.cutBonus}</td>
                  <td>{r.finishBonus}</td>
                  <td><strong>{r.total}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #333', fontWeight: 'bold' }}>
                <td>Total equipo</td>
                <td>{s.roundTotals.round1}</td>
                <td>{s.roundTotals.round2}</td>
                <td>{s.roundTotals.round3}</td>
                <td>{s.roundTotals.round4}</td>
                <td>{s.roundTotals.cutBonus}</td>
                <td>{s.roundTotals.finishBonus}</td>
                <td>{s.total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
    </div>
  );
}
