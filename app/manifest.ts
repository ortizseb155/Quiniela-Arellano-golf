import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Quiniela de Golf',
    short_name: 'Quiniela',
    description: 'Quiniela familiar de golf',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f0e6',
    theme_color: '#1b5e3a',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
