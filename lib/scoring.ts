// ============================================================
// MOTOR DE PUNTUACIÓN - QUINIELA DE GOLF
// Lógica pura (sin dependencias de Supabase/React) para poder
// probarla fácilmente y reutilizarla en frontend o backend.
// ============================================================

export type HoleResult =
  | 'albatross' | 'eagle' | 'birdie' | 'par' | 'bogey' | 'double_plus';

export const POINT_VALUES: Record<HoleResult, number> = {
  albatross: 8,
  eagle: 5,
  birdie: 2,
  par: 1,
  bogey: -1,
  double_plus: -3,
};

export const BONUS = {
  madeCut: 5,
  champion: 20,
  finalist: 10,
  top5: 5,
};

export interface Player {
  id: string;
  name: string;
  initialPrice: number;
  currentPrice: number;
  madeCut: boolean | null;
  finalPosition: number | null; // 1 = campeón, 2 = finalista, <=5 = top5
  withdrawn: boolean;
}

export interface HoleResultRow {
  playerId: string;
  round: 1 | 2 | 3 | 4;
  hole: number;
  result: HoleResult;
}

export interface Pick {
  participantId: string;
  playerId: string;
  pricePaid: number;
  isReplacement: boolean;
}

// --- Puntos de un jugador en una ronda específica (solo hoyos) ---
export function playerRoundHolePoints(
  playerId: string,
  round: number,
  holeResults: HoleResultRow[]
): number {
  return holeResults
    .filter(h => h.playerId === playerId && h.round === round)
    .reduce((sum, h) => sum + POINT_VALUES[h.result], 0);
}

// --- Bono de posición final (se aplica una sola vez, al terminar el torneo) ---
export function finishBonus(player: Player): number {
  if (player.finalPosition === 1) return BONUS.champion;
  if (player.finalPosition === 2) return BONUS.finalist;
  if (player.finalPosition !== null && player.finalPosition <= 5) return BONUS.top5;
  return 0;
}

// --- Puntos totales de un jugador (todas las rondas jugadas + bonos) ---
export function playerTotalPoints(
  player: Player,
  holeResults: HoleResultRow[],
  roundsPlayed: number[]
): number {
  const holePoints = roundsPlayed.reduce(
    (sum, r) => sum + playerRoundHolePoints(player.id, r, holeResults),
    0
  );
  const cutBonus = player.madeCut ? BONUS.madeCut : 0;
  return holePoints + cutBonus + finishBonus(player);
}

// --- Puntos de un equipo (participante) para una ronda dada ---
// Reglas: rondas 1-2 -> puntúan los 6 (o los que tenga el roster).
// Rondas 3-4 -> solo los 4 jugadores del roster con MÁS PUNTOS EN ESA RONDA puntúan.
export function teamRoundPoints(
  picks: Pick[],
  round: number,
  holeResults: HoleResultRow[]
): number {
  if (round <= 2) {
    // Los reemplazos NO estaban en el equipo en rondas 1-2, así que no cuentan aquí.
    return picks
      .filter(p => !p.isReplacement)
      .reduce((sum, p) => sum + playerRoundHolePoints(p.playerId, round, holeResults), 0);
  }

  // Rondas 3 y 4: todos los del roster (originales y reemplazos) compiten; solo los 4 mejores de ESA ronda puntúan.
  const roundPointsByPlayer = picks.map(p => ({
    playerId: p.playerId,
    points: playerRoundHolePoints(p.playerId, round, holeResults),
  }));
  const top4 = [...roundPointsByPlayer]
    .sort((a, b) => b.points - a.points)
    .slice(0, 4);
  return top4.reduce((sum, p) => sum + p.points, 0);
}

// --- Puntos totales de un equipo en el torneo (hoyos + bonos de cada jugador) ---
export function teamTotalPoints(
  picks: Pick[],
  players: Player[],
  holeResults: HoleResultRow[],
  roundsPlayed: number[]
): number {
  let total = 0;
  // Puntos de hoyos por ronda (aplicando regla de top-4 en rondas 3-4)
  for (const round of roundsPlayed) {
    total += teamRoundPoints(picks, round, holeResults);
  }
  // Bonos (corte + posición final) - se suman por jugador, no por ronda
  // Los golfistas de REEMPLAZO no ganan estos bonos: solo puntúan por su desempeño en hoyos.
  for (const pick of picks) {
    if (pick.isReplacement) continue;
    const player = players.find(pl => pl.id === pick.playerId);
    if (!player) continue;
    if (player.madeCut) total += BONUS.madeCut;
    total += finishBonus(player);
  }
  return total;
}

// --- ¿Cuántos jugadores del equipo NO pasaron el corte? ---
export function playersMissedCut(picks: Pick[], players: Player[]): Player[] {
  return picks
    .map(p => players.find(pl => pl.id === p.playerId))
    .filter((p): p is Player => !!p && p.madeCut === false);
}

// --- Presupuesto para elegir suplente(s) ---
// Se activa cuando el equipo pierde 3+ jugadores en el corte.
// Presupuesto = SUMA de los precios (recalculados post-corte) de los N golfistas
// más caros del equipo que no pasaron el corte, donde N = número de reemplazos necesarios.
export function replacementBudget(
  picks: Pick[],
  players: Player[]
): { needsReplacement: boolean; budget: number; missedCutCount: number; slotsNeeded: number } {
  const missed = playersMissedCut(picks, players);
  const needsReplacement = missed.length >= 3;
  if (!needsReplacement) {
    return { needsReplacement: false, budget: 0, missedCutCount: missed.length, slotsNeeded: 0 };
  }
  const slotsNeeded = missed.length - 2; // golfistas que faltan para llegar a los 4 que se necesitan
  const sortedPrices = missed.map(p => p.currentPrice).sort((a, b) => b - a);
  const budget = sortedPrices.slice(0, slotsNeeded).reduce((sum, price) => sum + price, 0);
  return { needsReplacement: true, budget, missedCutCount: missed.length, slotsNeeded };
}

// --- Factor de posición para el recálculo de precio post-corte ---
export function positionFactor(position: number | null, madeCut: boolean): number {
  if (!madeCut) return 0.65;
  if (position === null) return 0.65;
  if (position === 1) return 1.2;
  if (position <= 3) return 1.15;
  if (position <= 5) return 1.1;
  if (position <= 10) return 1.05;
  if (position <= 20) return 0.98;
  if (position <= 30) return 0.93;
  if (position <= 50) return 0.88;
  return 0.82;
}

// --- Factor de distancia respecto al líder (golpes de diferencia) ---
export function distanceFactor(strokesBehindLeader: number): number {
  return Math.max(0.85, 1 - 0.02 * strokesBehindLeader);
}

// --- Recalcular precio de un jugador después del corte (fin de ronda 2) ---
// precio_final = (precio_original * 0.6) + (precio_B * 0.4)
// precio_B = precio_original * factor_posicion * factor_distancia
export function recalculatePriceAfterCut(
  originalPrice: number,
  positionAfterRound2: number | null,
  strokesBehindLeader: number,
  madeCut: boolean
): number {
  const posF = positionFactor(positionAfterRound2, madeCut);
  const distF = distanceFactor(strokesBehindLeader);
  const priceB = originalPrice * posF * distF;
  return originalPrice * 0.6 + priceB * 0.4;
}

// --- Convertir un momio (formato americano positivo, ej. +450) en probabilidad implícita ---
// NOTA: esta fórmula asume momios positivos (underdog). Si alguna vez manejas
// momios negativos (favoritos, ej. -150), la fórmula cambia a |momio|/(|momio|+100).
export function moneylineToProbability(moneyline: number): number {
  return 100 / (moneyline + 100);
}

// --- Precio de TODO el campo basado en momios ---
// precio = ((A_jugador - A_min) / (A_max - A_min)) ^ 0.65 * 35 + 5
// El menos favorito del campo cuesta $5, el más favorito cuesta $40.
export function pricesFromOdds(moneylines: number[]): number[] {
  const probs = moneylines.map(moneylineToProbability);
  const min = Math.min(...probs);
  const max = Math.max(...probs);
  return probs.map(a => Math.pow((a - min) / (max - min), 0.65) * 35 + 5);
}
