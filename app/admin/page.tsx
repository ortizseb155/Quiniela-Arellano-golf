'use client';

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { replacementBudget, recalculatePriceAfterCut, pricesFromOdds } from '@/lib/scoring';

interface Tournament {
  id: string;
  name: string;
  year: number;
  status: string;
  current_round: number;
}

interface Player {
  id: string;
  name: string;
  moneyline: number | null;
  initial_price: number;
  current_price: number;
  made_cut: boolean | null;
  position_r2: number | null;
  strokes_behind_r2: number | null;
  score_r2: number | null;
  final_position: number | null;
  withdrawn: boolean;
}

export default function AdminPage() {
  const { participant } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);

  // Formularios
  const [newTournamentName, setNewTournamentName] = useState('');
  const [newTournamentYear, setNewTournamentYear] = useState(new Date().getFullYear());
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerMoneyline, setNewPlayerMoneyline] = useState<number | ''>('');
  const [newParticipantName, setNewParticipantName] = useState('');
  const [newParticipantPin, setNewParticipantPin] = useState('');
  const [allParticipants, setAllParticipants] = useState<{ id: string; name: string }[]>([]);
  const [draftCounts, setDraftCounts] = useState<Record<string, number>>({});
  const [draftTeams, setDraftTeams] = useState<Record<string, { name: string; price: number; isReplacement: boolean }[]>>({});
  const [cutLine, setCutLine] = useState<number | ''>('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { loadTournaments(); }, []);
  useEffect(() => { if (activeTournament) loadPlayers(activeTournament.id); }, [activeTournament]);
  useEffect(() => { if (activeTournament) loadDraftStatus(activeTournament.id); }, [activeTournament]);

  async function loadDraftStatus(tournamentId: string) {
    const [{ data: participantsData }, { data: picksData }, { data: playersData }] = await Promise.all([
      supabase.from('participants').select('id, name').order('name'),
      supabase.from('picks').select('participant_id, player_id, is_replacement').eq('tournament_id', tournamentId),
      supabase.from('players').select('id, name, current_price').eq('tournament_id', tournamentId),
    ]);
    setAllParticipants(participantsData || []);
    const counts: Record<string, number> = {};
    (picksData || []).filter(p => !p.is_replacement).forEach(p => { counts[p.participant_id] = (counts[p.participant_id] || 0) + 1; });
    setDraftCounts(counts);

    const teams: Record<string, { name: string; price: number; isReplacement: boolean }[]> = {};
    (picksData || []).forEach(pk => {
      const player = (playersData || []).find(pl => pl.id === pk.player_id);
      teams[pk.participant_id] = teams[pk.participant_id] || [];
      teams[pk.participant_id].push({ name: player?.name || '?', price: player?.current_price || 0, isReplacement: pk.is_replacement });
    });
    setDraftTeams(teams);
  }

  async function loadTournaments() {
    const { data } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
    setTournaments(data || []);
    if (data && data.length > 0 && !activeTournament) setActiveTournament(data[0]);
  }

  async function loadPlayers(tournamentId: string) {
    const { data } = await supabase.from('players').select('*').eq('tournament_id', tournamentId).order('initial_price', { ascending: false });
    setPlayers(data || []);
  }

  async function createTournament() {
    if (!newTournamentName) return;
    const { data, error } = await supabase
      .from('tournaments')
      .insert({ name: newTournamentName, year: newTournamentYear })
      .select()
      .single();
    if (!error && data) {
      setNewTournamentName('');
      await loadTournaments();
      setActiveTournament(data);
      setMessage(`Torneo "${data.name}" creado.`);
    }
  }

  async function handleBulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!activeTournament) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);

    // Acepta encabezados flexibles: Nombre/nombre/name, Momio/momio/moneyline/odds
    const parsed = rows.map(row => {
      const keys = Object.keys(row);
      const nameKey = keys.find(k => /^(nombre|name|golfista|jugador)$/i.test(k.trim()));
      const oddsKey = keys.find(k => /^(momio|moneyline|odds)$/i.test(k.trim()));
      return {
        name: nameKey ? String(row[nameKey]).trim() : null,
        moneyline: oddsKey ? Number(row[oddsKey]) : null,
      };
    }).filter(r => r.name && !isNaN(r.moneyline as number));

    if (parsed.length === 0) {
      setMessage('No se encontraron filas válidas. Revisa que el Excel tenga columnas "Nombre" y "Momio".');
      e.target.value = '';
      return;
    }

    const toInsert = parsed.map(p => ({
      tournament_id: activeTournament.id,
      name: p.name,
      moneyline: p.moneyline,
      initial_price: 0,
      current_price: 0,
    }));

    const { error } = await supabase.from('players').insert(toInsert);
    if (error) setMessage('Error al cargar: ' + error.message);
    else setMessage(`${toInsert.length} golfistas cargados. Ahora dale a "Calcular precios con momios".`);
    e.target.value = '';
    await loadPlayers(activeTournament.id);
  }

  async function addPlayer() {
    if (!activeTournament || !newPlayerName || newPlayerMoneyline === '') return;
    const moneyline = Number(newPlayerMoneyline);
    await supabase.from('players').insert({
      tournament_id: activeTournament.id,
      name: newPlayerName,
      moneyline,
      initial_price: 0, // se calcula con "Calcular precios con momios"
      current_price: 0,
    });
    setNewPlayerName('');
    setNewPlayerMoneyline('');
    await loadPlayers(activeTournament.id);
  }

  async function calculatePricesFromOdds() {
    if (!activeTournament) return;
    const withOdds = players.filter(p => p.moneyline !== null);
    if (withOdds.length < 2) {
      setMessage('Necesitas al menos 2 golfistas con momio capturado.');
      return;
    }
    const moneylines = withOdds.map(p => p.moneyline as number);
    const prices = pricesFromOdds(moneylines);
    const updates = withOdds.map((p, i) =>
      supabase.from('players').update({
        initial_price: Math.round(prices[i]),
        current_price: Math.round(prices[i]),
      }).eq('id', p.id)
    );
    await Promise.all(updates);
    await loadPlayers(activeTournament.id);
    setMessage('Precios calculados a partir de los momios.');
  }

  async function addParticipant() {
    if (!newParticipantName || newParticipantPin.length !== 4) {
      setMessage('El PIN debe tener 4 dígitos.');
      return;
    }
    const { error } = await supabase.from('participants').insert({
      name: newParticipantName,
      pin: newParticipantPin,
    });
    if (error) setMessage('Error: ' + error.message);
    else {
      setMessage(`Participante "${newParticipantName}" registrado.`);
      setNewParticipantName('');
      setNewParticipantPin('');
    }
  }

  async function toggleMadeCut(player: Player) {
    // Cicla: sin definir -> Pasó -> Fuera -> sin definir
    let newValue: boolean | null;
    if (player.made_cut === null) newValue = true;
    else if (player.made_cut === true) newValue = false;
    else newValue = null;
    await supabase.from('players').update({ made_cut: newValue }).eq('id', player.id);
    if (activeTournament) await loadPlayers(activeTournament.id);
  }

  async function saveCutData(player: Player, positionR2: number | null, strokesBehindR2: number | null) {
    await supabase.from('players').update({ position_r2: positionR2, strokes_behind_r2: strokesBehindR2 }).eq('id', player.id);
    if (activeTournament) await loadPlayers(activeTournament.id);
  }

  async function saveScoreR2(player: Player, score: number | null) {
    await supabase.from('players').update({ score_r2: score }).eq('id', player.id);
    if (activeTournament) await loadPlayers(activeTournament.id);
  }

  async function calculateCutAutomatically() {
    if (!activeTournament || cutLine === '') {
      setMessage('Captura la línea de corte primero.');
      return;
    }
    const withScores = players.filter(p => p.score_r2 !== null && p.score_r2 !== undefined);
    if (withScores.length === 0) {
      setMessage('Todavía no hay ningún score de ronda 2 capturado.');
      return;
    }

    // Ordenar de menor a mayor score (menor score = mejor posición en golf)
    const sorted = [...withScores].sort((a, b) => (a.score_r2 as number) - (b.score_r2 as number));
    const leaderScore = sorted[0].score_r2 as number;

    let rank = 1;
    const updates = sorted.map((p, i) => {
      // Posición estilo golf: empates comparten posición, el siguiente salta (ej. T2, T2, 4)
      if (i > 0 && p.score_r2 !== sorted[i - 1].score_r2) rank = i + 1;
      const strokesBehind = (p.score_r2 as number) - leaderScore;
      const madeCut = (p.score_r2 as number) <= Number(cutLine);
      const newPrice = recalculatePriceAfterCut(p.initial_price, rank, strokesBehind, madeCut);
      return supabase.from('players').update({
        position_r2: rank,
        strokes_behind_r2: strokesBehind,
        made_cut: madeCut,
        current_price: Math.round(newPrice),
      }).eq('id', p.id);
    });

    await Promise.all(updates);
    await loadPlayers(activeTournament.id);
    setMessage(`Calculado para ${sorted.length} golfista(s): posición, corte, golpes de diferencia y precio nuevo.`);
  }

  async function recalculateAllPrices() {
    if (!activeTournament) return;
    const updates = players.map(p => {
      const newPrice = recalculatePriceAfterCut(
        p.initial_price,
        p.position_r2,
        p.strokes_behind_r2 ?? 0,
        p.made_cut === true
      );
      return supabase.from('players').update({ current_price: Math.round(newPrice) }).eq('id', p.id);
    });
    await Promise.all(updates);
    await loadPlayers(activeTournament.id);
    setMessage('Precios recalculados con base en la posición al corte.');
  }

  async function setFinalPosition(player: Player, position: number | null) {
    await supabase.from('players').update({ final_position: position }).eq('id', player.id);
    if (activeTournament) await loadPlayers(activeTournament.id);
  }

  async function advanceRound() {
    if (!activeTournament) return;
    const nextRound = activeTournament.current_round + 1;
    await supabase.from('tournaments').update({ current_round: nextRound, status: 'in_progress' }).eq('id', activeTournament.id);
    await loadTournaments();
  }

  if (!participant) return <p>Inicia sesión para continuar.</p>;
  if (!participant.isAdmin) return <p>No tienes acceso a esta sección.</p>;

  return (
    <div>
      <h2>Admin</h2>
      {message && <div className="card"><p>{message}</p></div>}

      <div className="card">
        <h3>Crear torneo</h3>
        <div className="row">
          <input placeholder="Nombre (ej. Masters 2027)" value={newTournamentName} onChange={e => setNewTournamentName(e.target.value)} />
          <input type="number" value={newTournamentYear} onChange={e => setNewTournamentYear(Number(e.target.value))} style={{ width: 90 }} />
          <button onClick={createTournament}>Crear</button>
        </div>
      </div>

      <div className="card">
        <h3>Torneo activo</h3>
        <select
          value={activeTournament?.id || ''}
          onChange={e => setActiveTournament(tournaments.find(t => t.id === e.target.value) || null)}
        >
          {tournaments.map(t => (
            <option key={t.id} value={t.id}>{t.name} {t.year} ({t.status}, ronda {t.current_round})</option>
          ))}
        </select>
        {activeTournament && (
          <div style={{ marginTop: 8 }}>
            <button onClick={advanceRound}>Avanzar a ronda {activeTournament.current_round + 1}</button>
          </div>
        )}
      </div>

      {activeTournament && (
        <div className="card">
          <h3>Estado del draft</h3>
          <table>
            <thead><tr><th>Participante</th><th>Estatus</th></tr></thead>
            <tbody>
              {allParticipants.map(p => {
                const count = draftCounts[p.id] || 0;
                const team = draftTeams[p.id] || [];
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      {count >= 6 ? `✅ Ya eligió (${count}/6)` : count > 0 ? `⏳ En progreso (${count}/6)` : '❌ Aún no ha elegido'}
                      {team.length > 0 && (
                        <div className="muted" style={{ marginTop: 4 }}>
                          {team.map((t, i) => `${t.name} ($${t.price}${t.isReplacement ? ', reemplazo' : ''})`).join(' · ')}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>Registrar participante</h3>
        <div className="row">
          <input placeholder="Nombre" value={newParticipantName} onChange={e => setNewParticipantName(e.target.value)} />
          <input placeholder="PIN (4 dígitos)" maxLength={4} value={newParticipantPin} onChange={e => setNewParticipantPin(e.target.value.replace(/\D/g, ''))} style={{ width: 100 }} />
          <button onClick={addParticipant}>Registrar</button>
        </div>
      </div>

      {activeTournament && (
        <div className="card">
          <h3>Agregar golfista ({activeTournament.name})</h3>
          <div className="row">
            <input placeholder="Nombre del golfista" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} />
            <input type="number" placeholder="Momio (ej. 450)" value={newPlayerMoneyline} onChange={e => setNewPlayerMoneyline(e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 120 }} />
            <button onClick={addPlayer}>Agregar</button>
          </div>

          <div className="card" style={{ marginTop: 12, background: '#f5f0e6' }}>
            <h4 style={{ marginTop: 0 }}>O carga todos de un jalón desde Excel</h4>
            <p className="muted">El archivo debe tener dos columnas con encabezados: <strong>Nombre</strong> y <strong>Momio</strong> (ej. Scottie Scheffler, 250).</p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleBulkUpload} />
          </div>

          <div className="card" style={{ marginTop: 12, background: '#e8f0ea' }}>
            <h4 style={{ marginTop: 0 }}>Calcular corte, posición, golpes y precio automáticamente</h4>
            <p className="muted">
              Captura el score de cada golfista relativo a par en la columna "Score R2" de la tabla
              (ej. -8, +3, 0 para E). Luego pon la línea de corte aquí y dale al botón — calcula todo de un jalón.
            </p>
            <div className="row">
              <label>Línea de corte:
                <input
                  type="number"
                  placeholder="ej. 2"
                  value={cutLine}
                  onChange={e => setCutLine(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{ width: 80 }}
                />
              </label>
              <button onClick={calculateCutAutomatically}>⚡ Calcular todo</button>
            </div>
          </div>

          <div className="row" style={{ margin: '12px 0' }}>
            <button onClick={calculatePricesFromOdds}>💲 Calcular precios con momios</button>
            <button onClick={recalculateAllPrices}>💲 Recalcular precios (tras un ajuste manual)</button>
          </div>

          <table>
            <thead>
              <tr><th>Golfista</th><th>Momio</th><th>Precio</th><th>Score R2</th><th>Corte</th><th>Pos. R2</th><th>Golpes vs líder</th><th>Posición final</th></tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.moneyline ?? '-'}</td>
                  <td>${p.current_price}</td>
                  <td>
                    <input
                      type="number"
                      step={1}
                      style={{ width: 60 }}
                      defaultValue={p.score_r2 ?? ''}
                      onBlur={e => saveScoreR2(p, e.target.value !== '' ? Number(e.target.value) : null)}
                    />
                  </td>
                  <td>
                    <button onClick={() => toggleMadeCut(p)}>
                      {p.made_cut === true ? '✅ Pasó' : p.made_cut === false ? '❌ Fuera' : 'Sin definir'}
                    </button>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      style={{ width: 60 }}
                      defaultValue={p.position_r2 ?? ''}
                      onBlur={e => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        if (val !== null && val < 1) {
                          setMessage('La posición debe ser 1 o mayor.');
                          e.target.value = String(p.position_r2 ?? '');
                          return;
                        }
                        saveCutData(p, val, p.strokes_behind_r2);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      style={{ width: 60 }}
                      defaultValue={p.strokes_behind_r2 ?? ''}
                      onBlur={e => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        if (val !== null && val < 0) {
                          setMessage('Los golpes de diferencia no pueden ser negativos.');
                          e.target.value = String(p.strokes_behind_r2 ?? '');
                          return;
                        }
                        saveCutData(p, p.position_r2, val);
                      }}
                    />
                  </td>
                  <td>
                    <select value={p.final_position ?? ''} onChange={e => setFinalPosition(p, e.target.value ? Number(e.target.value) : null)}>
                      <option value="">-</option>
                      <option value="1">Campeón</option>
                      <option value="2">Finalista</option>
                      <option value="5">Top 5</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
