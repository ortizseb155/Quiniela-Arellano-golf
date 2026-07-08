import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import NavBar from '@/components/NavBar';
import './globals.css';

export const metadata = {
  title: 'Quiniela de Golf',
  description: 'Quiniela familiar de golf',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>
          <NavBar />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
