'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { teamTotalPoints, teamRoundPoints, playerRoundHolePoints, finishBonus, BONUS, Player, HoleResultRow, Pick } from '@/lib/scoring';

interface Tournament { id: string; name: string; year: number; current_round: number; status: string; }
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
    countsRound1: boolean;
    countsRound2: boolean;
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

  // Supabase limita cada consulta a un máximo de filas (usualmente 1000).
  // Esta función pagina automáticamente para traer TODAS las filas, sin importar cuántas sean.
  async function fetchAllRows(table: string, tournamentId: string) {
    const pageSize = 1000;
    let from = 0;
    let allRows: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from(table).select('*').eq('tournament_id', tournamentId)
        .range(from, from + pageSize - 1);
      if (error || !data) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return allRows;
  }

  async function load() {
    setLoading(true);
    const { data: tournaments } = await supabase
      .from('tournaments').select('*')
      .order('created_at', { ascending: false }).limit(1);
    const t = tournaments?.[0] || null;
    setTournament(t);
    if (!t) { setLoading(false); return; }

    const [playersData, picksData, holesData, participantsResult] = await Promise.all([
      fetchAllRows('players', t.id),
      fetchAllRows('picks', t.id),
      fetchAllRows('hole_results', t.id),
      supabase.from('participants').select('id, name'),
    ]);
    const participantsData = participantsResult.data;

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
          eligibleForRounds34: player?.madeCut === true, // no pasó el corte = no juega rondas 3-4, nunca cuenta ahí
        };
      });

      // ¿Quién está en el top 4 de la ronda 3 / ronda 4? Solo cuentan quienes SÍ pasaron el corte (juegan esas rondas).
      const eligibleIndices = roster.map((r, idx) => idx).filter(idx => roster[idx].eligibleForRounds34);
      const round3Top4Idx = new Set(
        [...eligibleIndices].map(idx => ({ idx, pts: roster[idx].round3 })).sort((a, b) => b.pts - a.pts).slice(0, 4).map(x => x.idx)
      );
      const round4Top4Idx = new Set(
        [...eligibleIndices].map(idx => ({ idx, pts: roster[idx].round4 })).sort((a, b) => b.pts - a.pts).slice(0, 4).map(x => x.idx)
      );

      const finalRoster = roster.map((r, idx, arr) => {
        const pick = picks[idx];
        const countsRound1 = !pick.isReplacement;
        const countsRound2 = !pick.isReplacement;
        const countsRound3 = round3Top4Idx.has(idx);
        const countsRound4 = round4Top4Idx.has(idx);
        const total = (countsRound1 ? r.round1 : 0) + (countsRound2 ? r.round2 : 0)
          + (countsRound3 ? r.round3 : 0) + (countsRound4 ? r.round4 : 0) + r.cutBonus + r.finishBonus;
        return { ...r, countsRound1, countsRound2, countsRound3, countsRound4, total };
      });
      const roundTotals = {
        round1: teamRoundPoints(picks, 1, holeResults, players),
        round2: teamRoundPoints(picks, 2, holeResults, players),
        round3: teamRoundPoints(picks, 3, holeResults, players),
        round4: teamRoundPoints(picks, 4, holeResults, players),
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
  if (tournament.status === 'draft_open') {
    return (
      <div className="card">
        <h2>Tabla — {tournament.name}</h2>
        <p>El draft sigue abierto. Los equipos de todos se revelan en cuanto el admin inicie la ronda 1.</p>
      </div>
    );
  }

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
                  <td style={r.countsRound1 ? {} : { textDecoration: 'line-through', color: '#b3261e' }}>{r.round1}</td>
                  <td style={r.countsRound2 ? {} : { textDecoration: 'line-through', color: '#b3261e' }}>{r.round2}</td>
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
