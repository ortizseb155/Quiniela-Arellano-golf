'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  function handleLogin() {
    const adminPin = process.env.NEXT_PUBLIC_ADMIN_PIN;
    if (pin && pin === adminPin) {
      localStorage.setItem('is_admin', 'true');
      router.push('/admin');
    } else {
      setError('PIN de administrador incorrecto');
    }
  }

  return (
    <div className="container">
      <h1>Acceso de administrador</h1>
      <div className="card">
        <input
          placeholder="PIN de administrador"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          type="password"
        />
        <button className="primary" onClick={handleLogin}>
          Entrar
        </button>
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
      </div>
    </div>
  );
}
