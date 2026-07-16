# Quiniela Arellano - Tenis

## Variables de entorno (configurar en Vercel)
- NEXT_PUBLIC_SUPABASE_URL = https://emuufouxvuxeahyuafof.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY = (tu anon key de Supabase)
- NEXT_PUBLIC_ADMIN_PIN = (el PIN que tú elijas para entrar al panel de admin, ej. 1234)

## Flujo de uso
1. Admin entra a /admin/participantes y da de alta a los participantes (nombre + PIN).
2. Admin entra a /admin, crea el torneo (nombre, categoría, tamaño del draw).
3. Admin entra a /admin/[id]/draw y captura el draw oficial en orden (jugador por posición, marcando byes).
4. Participantes entran a /login con su PIN, luego a /torneos y llenan su bracket completo.
5. Conforme se juegan los partidos reales, admin entra a /admin/[id]/resultados y captura ronda por ronda quién ganó.
6. Todos pueden ver /leaderboard/[id] para la tabla general.

## Puntaje
Ronda 1 = 1 pto, Ronda 2 = 2 ptos, Ronda 3 = 4 ptos... se duplica cada ronda.
Se otorgan los puntos de un partido si el jugador que el participante eligió para esa posición del bracket
coincide con el ganador real de esa misma posición (sin importar contra quién jugó realmente).
