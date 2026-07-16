'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const isAdmin = localStorage.getItem('is_admin');
    if (isAdmin === 'true') {
      setAllowed(true);
    } else {
      router.push('/admin/login');
    }
  }, [router]);

  if (!allowed) return null;
  return <>{children}</>;
}
