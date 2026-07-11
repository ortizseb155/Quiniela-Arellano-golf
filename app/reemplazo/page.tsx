'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { Player, Pick, replacementBudget } from '@/lib/scoring';

interface Tournament { id: string; name: string; year: number; status: string; }
interface PlayerRow { id: string; name: string; current_price: number; made_cut: boolean | null; }
interface MyPick { playerId: string; isReplacement: boolean; pricePaid: number; }

export default function ReemplazoPage() {
  const { participant } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [allPlayers, setAllPlayers] = useState<PlayerRow[]>([]);
  const [myPicks, setMyPicks] = useState<MyPick[]>([]);
  const [selections, setSelections] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { load(); }, [participant]);

  async function load() {
    if (!participant) return;
    const { data: tournaments } = await supabase
      .from('tournaments').select('*').eq('status', 'in_progress')
      .order('created_at', { ascending: false }).limit(1);
    const t = tournaments?.[0] || null;
    setTournament(t);
    if (!t) return;

    const [{ data: playersData }, { data: picksData }] = await Promise.all([
      supabase.from('players').select('id, name, current_price, made_cut').eq('tournament_id', t.id),
      supabase.from('picks').select('player_id, is_replacement, price_paid').eq('tournament_id', t.id).eq('participant_id', participant.id),
    ]);
    setAllPlayers(playersData || []);
    setMyPicks((picksData || []).map(p => ({ playerId: p.player_id, isReplacement: p.is_replacement, pricePaid: p.price_paid })));
    setSelections([]);
  }

  if (!participant) return <p>Inicia sesión para ver tus reemplazos.</p>;
  if (!tournament) return <p>No hay ningún torneo en curso ahora mismo.</p>;
  if (myPicks.length === 0) return <p>Todavía no tienes un equipo armado para este torneo.</p>;

  const myPlayers: Player[] = myPicks.map(mp => {
    const p = allPlayers.find(ap => ap.id === mp.playerId);
    return {
      id: mp.playerId,
      name: p?.name || '?',
      initialPrice: 0,
      currentPrice: p?.current_price || 0,
      madeCut: p?.made_cut ?? null,
      finalPosition: null,
      withdrawn: false,
    };
  });

  const picksForScoring: Pick[] = myPicks.map(mp => ({
    participantId: participant.id, playerId: mp.playerId, pricePaid: mp.pricePaid, isReplacement: mp.isReplacement,
  }));

  const { needsReplacement, budget: totalBudget, missedCutCount, slotsNeeded } = replacementBudget(picksForScoring, myPlayers);
  const alreadySpent = myPicks.filter(p => p.isReplacement).reduce((sum, p) => sum + p.pricePaid, 0);
  const replacementsAlready = myPicks.filter(p => p.isReplacement).length;
  const remainingBudget = totalBudget - alreadySpent;
  const slotsRemaining = Math.max(0, slotsNeeded - replacementsAlready);

  const myPlayerIds = new Set(myPicks.map(p => p.playerId));
  const eligiblePlayers = allPlayers.filter(p => !myPlayerIds.has(p.id));

  const selectedTotal = selections.reduce((sum, id) => sum + (allPlayers.find(p => p.id === id)?.current_price || 0), 0);

  function toggleSelection(playerId: string) {
    setSelections(prev => {
      if (prev.includes(playerId)) return prev.filter(id => id !== playerId);
      if (prev.length >= slotsRemaining) return prev;
      return [...prev, playerId];
    });
  }

  async function confirmReplacements() {
    if (!tournament || !participant) return;
    if (selections.length !== slotsRemaining) {
      setMessage(`Debes elegir exactamente ${slotsRemaining} golfista(s).`);
      return;
    }
    if (selectedTotal > remainingBudget) {
      setMessage('Te pasaste del presupuesto disponible.');
      return;
    }
    const rows = selections.map(playerId => ({
      tournament_id: tournament.id,
      participant_id: participant.id,
      player_id: playerId,
      price_paid: allPlayers.find(p => p.id === playerId)?.current_price || 0,
      is_replacement: true,
    }));
    const { error } = await supabase.from('picks').insert(rows);
    if (error) { setMessage('Error: ' + error.message); return; }
    setMessage('¡Reemplazo(s) confirmado(s)!');
    await load();
  }

  return (
    <div>
      <h2>Reemplazos — {tournament.name}</h2>

      {!needsReplacement && (
        <div className="card">
          <p>No necesitas reemplazos: tienes {6 - missedCutCount} golfistas que pasaron el corte (se necesitan al menos 4 para rondas 3-4).</p>
        </div>
      )}

      {needsReplacement && (
        <div className="card">
          <p>
            Perdiste <strong>{missedCutCount}</strong> golfistas en el corte. Necesitas <strong>{slotsNeeded}</strong> reemplazo(s)
            para llegar a los 4 que se necesitan en rondas 3-4.
          </p>
          <p>
            Presupuesto total: <span className="pill pill-green">${totalBudget}</span> (suma de los precios recalculados
            de los {slotsNeeded} golfistas más caros de tu equipo que no pasaron el corte).
          </p>
          {slotsRemaining === 0 ? (
            <p><strong>Ya completaste tus {slotsNeeded} reemplazo(s). ✅</strong></p>
          ) : (
            <p>Te falta{slotsRemaining > 1 ? 'n' : ''} elegir <strong>{slotsRemaining}</strong> más, con
            {' '}<span className="pill pill-green">${remainingBudget}</span> disponibles.</p>
          )}
        </div>
      )}

      {message && <p>{message}</p>}

      {needsReplacement && slotsRemaining > 0 && (
        <div className="card">
          <h3>Elige tus reemplazos</h3>
          <p className="row">
            <span className="pill pill-green">Presupuesto: ${remainingBudget}</span>
            <span className={selectedTotal > remainingBudget ? 'pill pill-red' : 'pill pill-green'}>Elegido: ${selectedTotal}</span>
            <span className="pill pill-green">{selections.length}/{slotsRemaining}</span>
          </p>
          <table>
            <thead><tr><th></th><th>Golfista</th><th>Precio</th></tr></thead>
            <tbody>
              {eligiblePlayers.map(p => (
                <tr key={p.id} style={{ opacity: !selections.includes(p.id) && selections.length >= slotsRemaining ? 0.4 : 1 }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selections.includes(p.id)}
                      disabled={!selections.includes(p.id) && selections.length >= slotsRemaining}
                      onChange={() => toggleSelection(p.id)}
                    />
                  </td>
                  <td>{p.name}</td>
                  <td>${p.current_price}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            style={{ marginTop: 12 }}
            onClick={confirmReplacements}
            disabled={selections.length !== slotsRemaining || selectedTotal > remainingBudget}
          >
            Confirmar reemplazo(s)
          </button>
        </div>
      )}

      <div className="card">
        <h3>Tu equipo actual</h3>
        <table>
          <thead><tr><th>Golfista</th><th>Precio</th><th>Corte</th><th>Tipo</th></tr></thead>
          <tbody>
            {myPlayers.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>${p.currentPrice}</td>
                <td>{p.madeCut === true ? '✅ Pasó' : p.madeCut === false ? '❌ Fuera' : 'Sin definir'}</td>
                <td>{myPicks.find(mp => mp.playerId === p.id)?.isReplacement ? 'Reemplazo' : 'Original'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
