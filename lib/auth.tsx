'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabaseClient';

interface Participant {
  id: string;
  name: string;
}

interface AuthContextType {
  participant: Participant | null;
  login: (name: string, pin: string) => Promise<string | null>; // devuelve error o null
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  participant: null,
  login: async () => 'No inicializado',
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [participant, setParticipant] = useState<Participant | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('quiniela_participant');
    if (stored) setParticipant(JSON.parse(stored));
  }, []);

  async function login(name: string, pin: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('participants')
      .select('id, name, pin')
      .ilike('name', name.trim())
      .single();

    if (error || !data) return 'No encontramos a ese participante.';
    if (data.pin !== pin.trim()) return 'PIN incorrecto.';

    const p = { id: data.id, name: data.name };
    setParticipant(p);
    localStorage.setItem('quiniela_participant', JSON.stringify(p));
    return null;
  }

  function logout() {
    setParticipant(null);
    localStorage.removeItem('quiniela_participant');
  }

  return (
    <AuthContext.Provider value={{ participant, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
