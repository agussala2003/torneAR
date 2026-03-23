import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        <title>torneAR | El Ranking del Fútbol Amateur</title>
        <meta name="description" content="Organiza a tu equipo, desafía rivales y compite en el ranking definitivo de fútbol amateur." />
        <meta name="theme-color" content="#0F0F0F" />
        
        {/* Open Graph Tags */}
        <meta property="og:title" content="torneAR | El Ranking del Fútbol Amateur" />
        <meta property="og:description" content="Organiza a tu equipo, desafía rivales y compite en el ranking definitivo de fútbol amateur." />
        <meta property="og:type" content="website" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
