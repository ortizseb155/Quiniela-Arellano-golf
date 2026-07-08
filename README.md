# Quiniela de Golf — Guía de instalación

## 1. Crear proyecto en Supabase (gratis)
1. Ve a https://supabase.com → crea cuenta → "New Project".
2. Cuando esté listo, ve a **SQL Editor** → pega el contenido de `supabase/schema.sql` → Run.
3. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public key`

## 2. Configurar el proyecto localmente
1. Instala Node.js (https://nodejs.org) si no lo tienes.
2. Copia `.env.example` a `.env.local` y pega tus valores de Supabase:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
3. En la carpeta del proyecto: `npm install` y luego `npm run dev` para probarlo en tu compu (http://localhost:3000).

## 3. Subir a GitHub y desplegar en Vercel
1. Crea un repositorio en GitHub y sube esta carpeta (`git init`, `git add .`, `git commit`, `git push`).
2. Ve a https://vercel.com → "Add New Project" → importa tu repo de GitHub.
3. En "Environment Variables" pega las mismas dos variables de `.env.local`.
4. Deploy. Te da un link tipo `tu-quiniela.vercel.app` para compartir con la familia.

## 4. Flujo de uso durante un torneo
1. **Admin**: crea el torneo, registra a los participantes (nombre + PIN de 4 dígitos), agrega la lista de golfistas con su precio.
2. Cada participante entra con su nombre + PIN y arma su equipo en **Mi equipo** (6 golfistas, $100).
3. Cuando arranca el torneo, el admin lo marca "en curso" y avanza de ronda.
4. Cualquiera puede entrar a **Capturar resultados** y meter el resultado de cada hoyo (usando el scorecard de ESPN/PGATour) para el golfista y ronda que quiera.
5. La **Tabla** se actualiza sola con cada resultado capturado.
6. Después del corte (ronda 2), el admin marca quién pasó/no pasó el corte en **Admin**.
7. Al final, el admin marca posición final (campeón/finalista/top 5).

## Pendiente (para completar contigo)
- **Fórmula de precio inicial** basada en momios → falta conectarla en `lib/scoring.ts` (`priceFromOdds`). Por ahora el precio se captura directo a mano en Admin, así que esto es opcional.
- **Fórmula de recálculo de precio post-corte** → falta conectarla (`recalculatePriceAfterCut`).
- **Pantalla de reemplazos** (cuando un equipo pierde 3+ golfistas en el corte): la lógica ya está lista en `lib/scoring.ts` (`replacementBudget`), pero falta la pantalla en la app para que el participante elija su suplente con ese presupuesto. La construimos en cuanto tengamos la fórmula de recálculo de precios, ya que el presupuesto depende de eso.
