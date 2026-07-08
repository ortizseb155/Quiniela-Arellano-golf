'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';

interface Tournament { id: string; name: string; year: number; budget: number; status: string; }
interface Player { id: string; name: string; current_price: number; }

export default function DraftPage() {
  const { participant } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [alreadyPicked, setAlreadyPicked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { load(); }, [participant]);

  async function load() {
    const { data: tournaments } = await supabase
      .from('tournaments').select('*').eq('status', 'draft_open')
      .order('created_at', { ascending: false }).limit(1);
    const t = tournaments?.[0] || null;
    setTournament(t);
    if (!t) return;

    const { data: playerData } = await supabase.from('players').select('id, name, current_price').eq('tournament_id', t.id).order('current_price', { ascending: false });
    setPlayers(playerData || []);

    if (participant) {
      const { data: picks } = await supabase.from('picks').select('player_id').eq('tournament_id', t.id).eq('participant_id', participant.id);
      if (picks && picks.length > 0) {
        setAlreadyPicked(true);
        setSelected(picks.map(p => p.player_id));
      }
    }
  }

  function togglePlayer(id: string) {
    if (alreadyPicked) return;
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 6) return prev;
      return [...prev, id];
    });
  }

  const totalSpent = selected.reduce((sum, id) => sum + (players.find(p => p.id === id)?.current_price || 0), 0);
  const budget = tournament?.budget ?? 100;

  async function submitTeam() {
    if (!participant || !tournament) return;
    if (selected.length !== 6) { setMessage('Debes elegir exactamente 6 golfistas.'); return; }
    if (totalSpent > budget) { setMessage('Te pasaste del presupuesto.'); return; }

    const rows = selected.map(playerId => ({
      tournament_id: tournament.id,
      participant_id: participant.id,
      player_id: playerId,
      price_paid: players.find(p => p.id === playerId)?.current_price || 0,
      is_replacement: false,
    }));
    const { error } = await supabase.from('picks').insert(rows);
    if (error) setMessage('Error: ' + error.message);
    else { setMessage('¡Equipo guardado!'); setAlreadyPicked(true); }
  }

  if (!participant) return <p>Inicia sesión para armar tu equipo.</p>;
  if (!tournament) return <p>No hay ningún draft abierto ahora mismo.</p>;

  return (
    <div>
      <h2>Arma tu equipo — {tournament.name} {tournament.year}</h2>
      <p className="row">
        <span className="pill pill-green">Presupuesto: ${budget}</span>
        <span className={totalSpent > budget ? 'pill pill-red' : 'pill pill-green'}>Gastado: ${totalSpent}</span>
        <span className="pill pill-green">Elegidos: {selected.length}/6</span>
      </p>
      {alreadyPicked && <p className="muted">Ya enviaste tu equipo. Contacta al admin si necesitas cambiarlo.</p>}
      {message && <p>{message}</p>}

      <table>
        <thead><tr><th></th><th>Golfista</th><th>Precio</th></tr></thead>
        <tbody>
          {players.map(p => (
            <tr key={p.id} style={{ opacity: !selected.includes(p.id) && selected.length >= 6 ? 0.4 : 1 }}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  disabled={alreadyPicked || (!selected.includes(p.id) && selected.length >= 6)}
                  onChange={() => togglePlayer(p.id)}
                />
              </td>
              <td>{p.name}</td>
              <td>${p.current_price}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {!alreadyPicked && (
        <button style={{ marginTop: 16 }} onClick={submitTeam} disabled={selected.length !== 6 || totalSpent > budget}>
          Confirmar equipo
        </button>
      )}
    </div>
  );
}
