// Lógica central del bracket: generación del árbol y cálculo de puntos.
// El árbol de partidos es FIJO (misma estructura para todos: la real y la de cada participante).
// Lo único que cambia es qué jugador "gana" cada nodo: en la realidad lo captura el admin,
// en la quiniela de cada participante lo elige el participante.

export interface DrawEntry {
  slot_number: number;
  player_name: string | null;
  is_bye: boolean;
  country?: string | null;
  seed?: number | null;
  status?: string | null; // 'Q', 'PR', 'LL' o null
}

export interface MatchRow {
  id: string;
  round: number;
  match_number: number;
  slot_a: number | null; // solo tiene valor fijo en la ronda 1
  slot_b: number | null;
  winner_slot: number | null; // resultado REAL, lo llena el admin
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function numRounds(bracketSize: number): number {
  return Math.log2(bracketSize);
}

// Puntos que vale acertar un partido de una ronda dada (ronda 1 = 1, ronda 2 = 2, ronda 3 = 4...)
export function pointsForRound(round: number): number {
  return Math.pow(2, round - 1);
}

// Genera la estructura de partidos vacía para un torneo (todas las rondas).
// Ronda 1 trae slot_a/slot_b fijos (según el draw). Rondas siguientes quedan sin slots
// fijos: se resuelven después, ya sea con resultados reales o con los picks de cada participante.
export function generateEmptyBracket(bracketSize: number, drawEntries: DrawEntry[]) {
  const rounds = numRounds(bracketSize);
  const matches: Omit<MatchRow, 'id'>[] = [];

  // Ronda 1: empareja slots consecutivos (1v2, 3v4, ...) según el orden en que
  // el admin capturó el draw oficial.
  const round1Count = bracketSize / 2;
  for (let i = 0; i < round1Count; i++) {
    matches.push({
      round: 1,
      match_number: i + 1,
      slot_a: i * 2 + 1,
      slot_b: i * 2 + 2,
      winner_slot: null,
    });
  }

  // Rondas siguientes: solo estructura (sin slots fijos todavía).
  for (let r = 2; r <= rounds; r++) {
    const count = bracketSize / Math.pow(2, r);
    for (let i = 0; i < count; i++) {
      matches.push({
        round: r,
        match_number: i + 1,
        slot_a: null,
        slot_b: null,
        winner_slot: null,
      });
    }
  }

  return matches;
}

// Dado un mapa de picks de UN participante (match_id -> slot elegido),
// calcula qué dos jugadores (slots) le tocaría elegir en cada partido de ronda 2+,
// según SUS PROPIOS picks anteriores (no según resultados reales).
export function resolveParticipantOptions(
  matches: MatchRow[],
  picks: Record<string, number>
): Record<string, { optionA: number | null; optionB: number | null }> {
  const byRoundAndNumber: Record<string, MatchRow> = {};
  matches.forEach((m) => {
    byRoundAndNumber[`${m.round}-${m.match_number}`] = m;
  });

  const options: Record<string, { optionA: number | null; optionB: number | null }> = {};

  matches
    .slice()
    .sort((a, b) => a.round - b.round)
    .forEach((m) => {
      if (m.round === 1) {
        options[m.id] = { optionA: m.slot_a, optionB: m.slot_b };
      } else {
        const feederA = byRoundAndNumber[`${m.round - 1}-${m.match_number * 2 - 1}`];
        const feederB = byRoundAndNumber[`${m.round - 1}-${m.match_number * 2}`];
        options[m.id] = {
          optionA: feederA ? picks[feederA.id] ?? null : null,
          optionB: feederB ? picks[feederB.id] ?? null : null,
        };
      }
    });

  return options;
}

// Calcula el puntaje total de un participante:
// por cada partido, si su pick coincide con el winner_slot REAL de ESE MISMO nodo (ronda + match_number), suma puntos.
export function computeScore(
  matches: MatchRow[],
  picks: Record<string, number>
): { total: number; detail: { matchId: string; round: number; points: number; correct: boolean }[] } {
  let total = 0;
  const detail: { matchId: string; round: number; points: number; correct: boolean }[] = [];

  matches.forEach((m) => {
    const pick = picks[m.id];
    const correct = pick != null && m.winner_slot != null && pick === m.winner_slot;
    const points = correct ? pointsForRound(m.round) : 0;
    total += points;
    detail.push({ matchId: m.id, round: m.round, points, correct });
  });

  return { total, detail };
}
