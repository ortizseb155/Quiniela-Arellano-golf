'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import {
  HoleResult, POINT_VALUES, playerRoundHolePoints,
  BONUS, Player, HoleResultRow, Pick,
} from '@/lib/scoring';

interface Tournament { id: string; name: string; year: number; current_round: number; }
interface ParticipantRow { id: string; name: string; }

const RESULT_LABELS: Record<HoleResult, string> = {
  albatross: 'Albatros (+8)',
  eagle: 'Águila (+5)',
  birdie: 'Birdie (+2)',
  par: 'Par (+1)',
  bogey: 'Bogey (-1)',
  double_plus: 'Doble o peor (-3)',
};

interface TeamStanding {
  participantId: string;
  participantName: string;
  total: number;
  roster: {
    playerName: string;
    round1: number; round2: number; round3: number; round4: number;
    cutBonus: number; finishBonus: number; total: number;
  }[];
}

export default function SimulacionPage() {
  const { participant } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [officialResults, setOfficialResults] = useState<HoleResultRow[]>([]);
  const [myResults, setMyResults] = useState<HoleResultRow[]>([]); // mis overrides guardados
  const [myStatus, setMyStatus] = useState<Record<string, { madeCut: boolean | null; finalPosition: number | null }>>({});
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [allPicks, setAllPicks] = useState<Record<string, Pick[]>>({});

  const [editPlayer, setEditPlayer] = useState('');
  const [editRound, setEditRound] = useState(1);
  const [editHoles, setEditHoles] = useState<Record<number, HoleResult | ''>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { load(); }, [participant]);
  useEffect(() => { computeStandings(); }, [officialResults, myResults, players, allPicks]);
  useEffect(() => { if (editPlayer) loadEditingHoles(); }, [editPlayer, editRound, officialResults, myResults]);

  async function load() {
    if (!participant) return;
    const { data: tournaments } = await supabase
      .from('tournaments').select('*').eq('status', 'in_progress')
      .order('created_at', { ascending: false }).limit(1);
    const t = tournaments?.[0] || null;
    setTournament(t);
    if (!t) return;

    const [{ data: playersData }, { data: officialData }, { data: mineData }, { data: picksData }, { data: participantsData }, { data: myStatusData }] = await Promise.all([
      supabase.from('players').select('*').eq('tournament_id', t.id),
      supabase.from('hole_results').select('*').eq('tournament_id', t.id),
      supabase.from('simulated_hole_results').select('*').eq('tournament_id', t.id).eq('participant_id', participant.id),
      supabase.from('picks').select('*').eq('tournament_id', t.id),
      supabase.from('participants').select('id, name'),
      supabase.from('simulated_player_status').select('*').eq('tournament_id', t.id).eq('participant_id', participant.id),
    ]);

    const statusMap: Record<string, { madeCut: boolean | null; finalPosition: number | null }> = {};
    (myStatusData || []).forEach(s => {
      statusMap[s.player_id] = { madeCut: s.made_cut, finalPosition: s.final_position };
    });
    setMyStatus(statusMap);

    const pickedIds = new Set((picksData || []).map(p => p.player_id));
    const filteredPlayers = (playersData || []).filter(p => pickedIds.has(p.id));

    setPlayers(filteredPlayers.map(p => ({
      id: p.id, name: p.name, initialPrice: p.initial_price, currentPrice: p.current_price,
      madeCut: p.made_cut, finalPosition: p.final_position, withdrawn: p.withdrawn,
    })));
    setOfficialResults((officialData || []).map(h => ({ playerId: h.player_id, round: h.round, hole: h.hole, result: h.result })));
    setMyResults((mineData || []).map(h => ({ playerId: h.player_id, round: h.round, hole: h.hole, result: h.result })));
    setParticipants(participantsData || []);

    const byParticipant: Record<string, Pick[]> = {};
    (picksData || []).forEach(pk => {
      const pick: Pick = { participantId: pk.participant_id, playerId: pk.player_id, pricePaid: pk.price_paid, isReplacement: pk.is_replacement };
      byParticipant[pk.participant_id] = byParticipant[pk.participant_id] || [];
      byParticipant[pk.participant_id].push(pick);
    });
    setAllPicks(byParticipant);
  }

  // Combina oficial + mis hipótesis (mis hipótesis ganan si hay override para esa hoyo/ronda/jugador)
  function mergedResults(): HoleResultRow[] {
    const map = new Map<string, HoleResultRow>();
    officialResults.forEach(h => map.set(`${h.playerId}-${h.round}-${h.hole}`, h));
    myResults.forEach(h => map.set(`${h.playerId}-${h.round}-${h.hole}`, h));
    return Array.from(map.values());
  }

  // Estado efectivo de un jugador: mi hipótesis si la capturé, si no el oficial
  function effectiveStatus(player: Player): { madeCut: boolean | null; finalPosition: number | null } {
    const override = myStatus[player.id];
    if (override && (override.madeCut !== null || override.finalPosition !== null)) {
      return {
        madeCut: override.madeCut !== null ? override.madeCut : player.madeCut,
        finalPosition: override.finalPosition !== null ? override.finalPosition : player.finalPosition,
      };
    }
    return { madeCut: player.madeCut, finalPosition: player.finalPosition };
  }

  function computeStandings() {
    if (!tournament) return;
    const merged = mergedResults();
    const roundsPlayed = [1, 2, 3, 4]; // en simulación consideramos las 4, con lo hipotético rellenando lo que falte

    const result: TeamStanding[] = Object.entries(allPicks).map(([participantId, picks]) => {
      const roster = picks.map(pk => {
        const player = players.find(pl => pl.id === pk.playerId);
        const round1 = playerRoundHolePoints(pk.playerId, 1, merged);
        const round2 = playerRoundHolePoints(pk.playerId, 2, merged);
        const round3 = playerRoundHolePoints(pk.playerId, 3, merged);
        const round4 = playerRoundHolePoints(pk.playerId, 4, merged);
        const status = player ? effectiveStatus(player) : { madeCut: null, finalPosition: null };
        const cutBonus = status.madeCut ? BONUS.madeCut : 0;
        const finBonus = status.finalPosition === 1 ? BONUS.champion
          : status.finalPosition === 2 ? BONUS.finalist
          : (status.finalPosition !== null && status.finalPosition <= 5) ? BONUS.top5
          : 0;
        return {
          playerName: player?.name || '?',
          round1, round2, round3, round4, cutBonus, finishBonus: finBonus,
          total: round1 + round2 + round3 + round4 + cutBonus + finBonus,
        };
      });
      const total = roster.reduce((sum, r) => sum + r.total, 0);
      const name = participants.find(p => p.id === participantId)?.name || '?';
      return { participantId, participantName: name, total, roster };
    }).sort((a, b) => b.total - a.total);

    setStandings(result);
  }

  function loadEditingHoles() {
    const merged = mergedResults();
    const map: Record<number, HoleResult | ''> = {};
    for (let h = 1; h <= 18; h++) map[h] = '';
    merged.filter(r => r.playerId === editPlayer && r.round === editRound).forEach(r => { map[r.hole] = r.result; });
    setEditHoles(map);
  }

  function setHole(hole: number, result: HoleResult | '') {
    setEditHoles(prev => ({ ...prev, [hole]: result }));
  }

  async function saveSimulation() {
    if (!tournament || !participant || !editPlayer) return;

    const toUpsert = Object.entries(editHoles)
      .filter(([, result]) => result !== '')
      .map(([hole, result]) => ({
        tournament_id: tournament.id,
        participant_id: participant.id,
        player_id: editPlayer,
        round: editRound,
        hole: Number(hole),
        result: result as HoleResult,
      }));

    const holesToClear = Object.entries(editHoles)
      .filter(([, result]) => result === '')
      .map(([hole]) => Number(hole));

    if (holesToClear.length > 0) {
      await supabase.from('simulated_hole_results').delete()
        .eq('tournament_id', tournament.id).eq('participant_id', participant.id)
        .eq('player_id', editPlayer).eq('round', editRound)
        .in('hole', holesToClear);
    }

    const { error } = toUpsert.length > 0
      ? await supabase.from('simulated_hole_results').upsert(toUpsert, { onConflict: 'participant_id,player_id,round,hole' })
      : { error: null };

    if (error) { setMessage('Error: ' + error.message); return; }
    setMessage('Simulación guardada. Solo tú la ves.');
    await load();
  }

  async function saveHypotheticalStatus(playerId: string, madeCut: boolean | null, finalPosition: number | null) {
    if (!tournament || !participant) return;
    await supabase.from('simulated_player_status').upsert({
      tournament_id: tournament.id,
      participant_id: participant.id,
      player_id: playerId,
      made_cut: madeCut,
      final_position: finalPosition,
    }, { onConflict: 'participant_id,player_id' });
    await load();
  }

  function toggleHypotheticalCut(playerId: string) {
    const current = myStatus[playerId]?.madeCut ?? null;
    const currentPos = myStatus[playerId]?.finalPosition ?? null;
    let next: boolean | null;
    if (current === null) next = true;
    else if (current === true) next = false;
    else next = null;
    saveHypotheticalStatus(playerId, next, currentPos);
  }

  async function resetSimulation() {
    if (!tournament || !participant) return;
    await supabase.from('simulated_hole_results').delete().eq('tournament_id', tournament.id).eq('participant_id', participant.id);
    await supabase.from('simulated_player_status').delete().eq('tournament_id', tournament.id).eq('participant_id', participant.id);
    setMessage('Tu simulación fue reiniciada (vuelve a partir de lo oficial).');
    await load();
  }

  if (!participant) return <p>Inicia sesión para usar la simulación.</p>;
  if (!tournament) return <p>No hay ningún torneo en curso ahora mismo.</p>;
  if (players.length === 0) return <p>Todavía nadie ha elegido a sus golfistas para este torneo.</p>;

  return (
    <div>
      <h2>Simulación — {tournament.name}</h2>
      <p className="muted">
        Esto es una proyección personal tuya. Puedes inventar resultados hipotéticos para ver qué pasaría —
        nadie más lo ve, y no afecta el resultado oficial de la quiniela.
      </p>
      {message && <p>{message}</p>}

      <div className="card">
        <h3>Capturar hipótesis</h3>
        <div className="row" style={{ marginBottom: 12 }}>
          <label>Ronda:
            <select value={editRound} onChange={e => setEditRound(Number(e.target.value))}>
              {[1, 2, 3, 4].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label>Golfista:
            <select value={editPlayer} onChange={e => setEditPlayer(e.target.value)}>
              <option value="">Selecciona...</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>

        {editPlayer && (
          <>
            <div className="card" style={{ background: '#f5f0e6', marginBottom: 12 }}>
              <h4 style={{ marginTop: 0 }}>Corte y posición final hipotéticos (no dependen de la ronda)</h4>
              <div className="row">
                <button onClick={() => toggleHypotheticalCut(editPlayer)}>
                  Corte: {
                    (myStatus[editPlayer]?.madeCut ?? null) === true ? '✅ Pasó (hipotético)'
                    : (myStatus[editPlayer]?.madeCut ?? null) === false ? '❌ Fuera (hipotético)'
                    : 'Sin definir (usa lo oficial)'
                  }
                </button>
                <label>Posición final:
                  <select
                    value={myStatus[editPlayer]?.finalPosition ?? ''}
                    onChange={e => saveHypotheticalStatus(
                      editPlayer,
                      myStatus[editPlayer]?.madeCut ?? null,
                      e.target.value ? Number(e.target.value) : null
                    )}
                  >
                    <option value="">Sin definir (usa lo oficial)</option>
                    <option value="1">Campeón</option>
                    <option value="2">Finalista</option>
                    <option value="5">Top 5</option>
                  </select>
                </label>
              </div>
            </div>

            <table>
              <thead><tr><th>Hoyo</th><th>Resultado hipotético</th></tr></thead>
              <tbody>
                {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => (
                  <tr key={hole}>
                    <td>{hole}</td>
                    <td>
                      <select value={editHoles[hole] || ''} onChange={e => setHole(hole, e.target.value as HoleResult | '')}>
                        <option value="">-</option>
                        {(Object.keys(POINT_VALUES) as HoleResult[]).map(r => (
                          <option key={r} value={r}>{RESULT_LABELS[r]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button style={{ marginTop: 12 }} onClick={saveSimulation}>Guardar mi hipótesis</button>
          </>
        )}
      </div>

      <div className="row" style={{ margin: '16px 0' }}>
        <button onClick={resetSimulation}>🔄 Reiniciar mi simulación (volver a lo oficial)</button>
      </div>

      <h3>Proyección con tu simulación</h3>
      {standings.map((s, i) => (
        <div className="card" key={s.participantId}>
          <h3>{i + 1}. {s.participantName} — {s.total} pts (proyectado)</h3>
          <table>
            <thead>
              <tr><th>Golfista</th><th>R1</th><th>R2</th><th>R3</th><th>R4</th><th>Corte</th><th>Bono</th><th>Total</th></tr>
            </thead>
            <tbody>
              {s.roster.sort((a, b) => b.total - a.total).map((r, idx) => (
                <tr key={idx}>
                  <td>{r.playerName}</td>
                  <td>{r.round1}</td><td>{r.round2}</td><td>{r.round3}</td><td>{r.round4}</td>
                  <td>{r.cutBonus}</td><td>{r.finishBonus}</td><td><strong>{r.total}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
