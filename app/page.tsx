import Link from 'next/link';

export default function Home() {
  return (
    <div className="container">
      <h1>🎾 Quiniela Arellano - Tenis</h1>
      <div className="card">
        <Link href="/login">Entrar como participante</Link>
      </div>
      <div className="card">
        <Link href="/admin">Panel de administración</Link>
      </div>
    </div>
  );
}
