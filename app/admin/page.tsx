'use client';

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
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
  final_position: number | null;
  withdrawn: boolean;
}

export default function AdminPage() {
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
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { loadTournaments(); }, []);
  useEffect(() => { if (activeTournament) loadPlayers(activeTournament.id); }, [activeTournament]);

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
        initial_price: Number(prices[i].toFixed(2)),
        current_price: Number(prices[i].toFixed(2)),
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
    const newValue = player.made_cut === true ? false : true;
    await supabase.from('players').update({ made_cut: newValue }).eq('id', player.id);
    if (activeTournament) await loadPlayers(activeTournament.id);
  }

  async function saveCutData(player: Player, positionR2: number | null, strokesBehindR2: number | null) {
    await supabase.from('players').update({ position_r2: positionR2, strokes_behind_r2: strokesBehindR2 }).eq('id', player.id);
    if (activeTournament) await loadPlayers(activeTournament.id);
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
      return supabase.from('players').update({ current_price: Number(newPrice.toFixed(2)) }).eq('id', p.id);
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

          <div className="row" style={{ margin: '12px 0' }}>
            <button onClick={calculatePricesFromOdds}>💲 Calcular precios con momios</button>
            <button onClick={recalculateAllPrices}>💲 Recalcular precios post-corte (ronda 2)</button>
          </div>

          <table>
            <thead>
              <tr><th>Golfista</th><th>Momio</th><th>Precio</th><th>Corte</th><th>Pos. R2</th><th>Golpes vs líder</th><th>Posición final</th></tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.moneyline ?? '-'}</td>
                  <td>${p.current_price}</td>
                  <td>
                    <button onClick={() => toggleMadeCut(p)}>
                      {p.made_cut === true ? '✅ Pasó' : p.made_cut === false ? '❌ Fuera' : 'Sin definir'}
                    </button>
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 60 }}
                      defaultValue={p.position_r2 ?? ''}
                      onBlur={e => saveCutData(p, e.target.value ? Number(e.target.value) : null, p.strokes_behind_r2)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 60 }}
                      defaultValue={p.strokes_behind_r2 ?? ''}
                      onBlur={e => saveCutData(p, p.position_r2, e.target.value ? Number(e.target.value) : null)}
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
