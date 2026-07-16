'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { generateEmptyBracket } from '@/lib/bracket';
import AdminGuard from '@/lib/AdminGuard';

interface Slot {
  slot_number: number;
  player_name: string;
  country: string;
  status: string; // número de precalificado, o 'Q', 'PR', 'LL'
  is_bye: boolean;
}

export default function DrawPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [bracketSize, setBracketSize] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [saving, setSaving] = useState(false);
  const [importError, setImportError] = useState('');

  useEffect(() => {
    supabase
      .from('tournaments')
      .select('bracket_size')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setBracketSize(data.bracket_size);
        setSlots(
          Array.from({ length: data.bracket_size }, (_, i) => ({
            slot_number: i + 1,
            player_name: '',
            country: '',
            status: '',
            is_bye: false,
          }))
        );
      });
  }, [id]);

  function updateSlot(index: number, field: keyof Slot, value: string | boolean) {
    setSlots((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value } as Slot;
      return copy;
    });
  }

  function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // Si la primera fila no parece datos (col 3 no es número ni Q/PR/LL), la saltamos por ser encabezado.
        let startIndex = 0;
        if (rows.length > 0) {
          const thirdCell = String(rows[0][2] ?? '').trim().toUpperCase();
          const looksLikeData = /^\d+$/.test(thirdCell) || ['Q', 'PR', 'LL'].includes(thirdCell);
          if (!looksLikeData) startIndex = 1;
        }

        const dataRows = rows.slice(startIndex).filter((r) => r && r[1]); // requiere al menos el nombre

        if (dataRows.length > bracketSize) {
          setImportError(
            `El Excel trae ${dataRows.length} jugadores pero el draw es de ${bracketSize} posiciones.`
          );
          return;
        }

        setSlots((prev) => {
          const copy = [...prev];
          dataRows.forEach((row, i) => {
            const country = String(row[0] ?? '').trim();
            const player = String(row[1] ?? '').trim();
            const rawStatus = String(row[2] ?? '').trim().toUpperCase();
            copy[i] = {
              ...copy[i],
              player_name: player,
              country,
              status: rawStatus,
              is_bye: false,
            };
          });
          return copy;
        });
      } catch (err) {
        setImportError('No se pudo leer el archivo. Verifica que sea un .xlsx válido.');
      }
    };
    reader.readAsBinaryString(file);
  }

  async function saveDraw() {
    setSaving(true);

    // Guarda las posiciones del draw
    const drawRows = slots.map((s) => ({
      tournament_id: id,
      slot_number: s.slot_number,
      player_name: s.is_bye ? null : s.player_name,
      country: s.is_bye ? null : s.country,
      status: s.is_bye ? null : s.status,
      is_bye: s.is_bye,
    }));
    await supabase.from('draw_entries').insert(drawRows);

    // Genera la estructura completa de partidos (todas las rondas)
    const matches = generateEmptyBracket(bracketSize, drawRows as any);
    const matchRows = matches.map((m) => ({ ...m, tournament_id: id }));
    await supabase.from('matches').insert(matchRows);

    await supabase.from('tournaments').update({ status: 'open' }).eq('id', id);

    setSaving(false);
    router.push('/admin');
  }

  return (
    <AdminGuard>
    <div className="container">
      <h1>Cargar draw</h1>
      <p style={{ opacity: 0.7 }}>
        Captura los jugadores en el orden oficial del draw (posición 1 a {bracketSize}), o
        impórtalos desde un Excel con columnas: País, Jugador, Precalificado/Q/PR/LL. Marca
        "bye" si esa posición no tiene rival en la primera ronda.
      </p>

      <div className="card">
        <label style={{ fontSize: 14 }}>Importar desde Excel (.xlsx)</label>
        <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} />
        {importError && <p style={{ color: '#f87171' }}>{importError}</p>}
      </div>

      {slots.map((s, i) => (
        <div key={s.slot_number} className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ width: 24 }}>{s.slot_number}</span>
          <input
            placeholder="Jugador"
            value={s.player_name}
            disabled={s.is_bye}
            onChange={(e) => updateSlot(i, 'player_name', e.target.value)}
            style={{ flex: 2, minWidth: 120 }}
          />
          <input
            placeholder="País"
            value={s.country}
            disabled={s.is_bye}
            onChange={(e) => updateSlot(i, 'country', e.target.value)}
            style={{ flex: 1, minWidth: 70 }}
          />
          <input
            placeholder="# / Q / PR / LL"
            value={s.status}
            disabled={s.is_bye}
            onChange={(e) => updateSlot(i, 'status', e.target.value)}
            style={{ flex: 1, minWidth: 90 }}
          />
          <label style={{ whiteSpace: 'nowrap', fontSize: 14 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={s.is_bye}
              onChange={(e) => updateSlot(i, 'is_bye', e.target.checked)}
            />
            Bye
          </label>
        </div>
      ))}
      <button className="primary" onClick={saveDraw} disabled={saving}>
        {saving ? 'Guardando...' : 'Guardar draw y generar bracket'}
      </button>
    </div>
    </AdminGuard>
  );
}
