'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { HoleResult, POINT_VALUES } from '@/lib/scoring';

interface Tournament { id: string; name: string; year: number; current_round: number; }
interface Player { id: string; name: string; }

const RESULT_LABELS: Record<HoleResult, string> = {
  albatross: 'Albatros (+8)',
  eagle: 'Águila (+5)',
  birdie: 'Birdie (+2)',
  par: 'Par (+1)',
  bogey: 'Bogey (-1)',
  double_plus: 'Doble o peor (-3)',
};

export default function CapturePage() {
  const { participant } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [round, setRound] = useState(1);
  const [holes, setHoles] = useState<Record<number, HoleResult | ''>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { loadTournament(); }, []);
  useEffect(() => { if (selectedPlayer && tournament) loadExisting(); }, [selectedPlayer, round, tournament]);

  async function loadTournament() {
    const { data } = await supabase.from('tournaments').select('*').eq('status', 'in_progress').order('created_at', { ascending: false }).limit(1);
    const t = data?.[0] || null;
    setTournament(t);
    if (t) {
      setRound(t.current_round || 1);
      const { data: playerData } = await supabase.from('players').select('id, name').eq('tournament_id', t.id).order('name');
      setPlayers(playerData || []);
    }
  }

  async function loadExisting() {
    if (!tournament) return;
    const { data } = await supabase
      .from('hole_results').select('hole, result')
      .eq('tournament_id', tournament.id).eq('player_id', selectedPlayer).eq('round', round);
    const map: Record<number, HoleResult | ''> = {};
    for (let h = 1; h <= 18; h++) map[h] = '';
    (data || []).forEach(r => { map[r.hole] = r.result as HoleResult; });
    setHoles(map);
  }

  function setHole(hole: number, result: HoleResult | '') {
    setHoles(prev => ({ ...prev, [hole]: result }));
  }

  async function saveAll() {
    if (!tournament || !selectedPlayer) return;
    const rows = Object.entries(holes)
      .filter(([, result]) => result !== '')
      .map(([hole, result]) => ({
        tournament_id: tournament.id,
        player_id: selectedPlayer,
        round,
        hole: Number(hole),
        result: result as HoleResult,
      }));
    const { error } = await supabase.from('hole_results').upsert(rows, { onConflict: 'player_id,round,hole' });
    setMessage(error ? 'Error: ' + error.message : `Guardado por ${participant?.name}. ¡Gracias!`);
  }

  if (!participant) return <p>Inicia sesión para capturar resultados.</p>;
  if (!tournament) return <p>No hay ningún torneo en curso ahora mismo.</p>;

  return (
    <div>
      <h2>Capturar resultados — {tournament.name}</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <label>Ronda:
          <select value={round} onChange={e => setRound(Number(e.target.value))}>
            {[1, 2, 3, 4].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label>Golfista:
          <select value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}>
            <option value="">Selecciona...</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      {selectedPlayer && (
        <div className="card">
          <table>
            <thead><tr><th>Hoyo</th><th>Resultado</th></tr></thead>
            <tbody>
              {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => (
                <tr key={hole}>
                  <td>{hole}</td>
                  <td>
                    <select value={holes[hole] || ''} onChange={e => setHole(hole, e.target.value as HoleResult | '')}>
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
          <button style={{ marginTop: 12 }} onClick={saveAll}>Guardar ronda {round}</button>
        </div>
      )}
      {message && <p>{message}</p>}
    </div>
  );
}
