# torneAR

> La plataforma competitiva para el fútbol amateur argentino.

torneAR conecta equipos y jugadores, gestiona partidos con un sistema de ELO en tiempo real, y ofrece un Mercado de Pases para que los equipos encuentren refuerzos — todo con una UX de primera categoría.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.81 + Expo 54 (Expo Router) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Styling | NativeWind v4 (Tailwind CSS for RN) |
| Animations | react-native-reanimated v4.1 |
| State | Zustand 5 + React Context |
| Forms | React Hook Form + Zod 4 |
| Language | TypeScript (strict mode) |

---

## Core Features — v1.0

### Sistema Competitivo
- **Motor ELO** — Rating dinámico calculado automáticamente al cargar resultados. Implementado como Trigger de PostgreSQL para garantizar idempotencia: nunca se aplica dos veces, nunca se pierde una actualización.
- **Fair Play Score (FPS)** — Puntuación paralela al ELO que refleja el comportamiento deportivo del equipo. Penaliza inasistencias, cancelaciones tardías y disputas perdidas; premia la consistencia.
- **Ranking en vivo** — Tabla de posiciones de equipos y jugadores (goleadores, MVPs, partidos jugados) filtrable por zona, tipo de cancha y categoría.

### Partidos y Disputas
- **Ciclo completo de partido** — Propuesta → Confirmación → EN VIVO → Carga de resultado → Historial.
- **Sistema de Disputas** — Resolución por evidencia cuando ambos equipos reportan resultados distintos.
- **Geofencing** — Restricción de zonas para validar coherencia geográfica de los partidos.
- **Códigos de invitado** — Un jugador puede unirse como árbitro o visitante mediante código único.

### Mercado de Pases
- Equipos publican búsqueda de jugadores (posición, zona, tipo de cancha, fecha).
- Jugadores publican su perfil como agente libre (`BUSCA_EQUIPO` / `EQUIPO_BUSCA_JUGADOR`).
- Chat en tiempo real vía Supabase Realtime para negociar incorporaciones.
- Notificaciones push (Expo Push Notifications) ante nuevos mensajes.

### UX Premium
- **Haptics físicos** en botones, selectores y tabs (`expo-haptics`).
- **Skeleton loaders** que reemplazan spinners bloqueantes en Market y Ranking.
- **Staggered entry animations** con `FadeInDown / FadeInRight / FadeInUp` en todas las listas.
- **Badge EN_VIVO pulsante** en partidos en curso.
- **Press-scale feedback** en botones primarios (`HeroButton`) con Reanimated spring.

---

## Arquitectura Backend

### Seguridad — Row Level Security (RLS)
Cada tabla tiene políticas RLS estrictas. Los usuarios solo pueden leer y modificar sus propios datos. Las operaciones sensibles (confirmar resultado, aceptar propuesta de horario) están protegidas por verificación de rol (`CAPITAN` / `SUBCAPITAN`).

### Triggers para ELO y FPS
El cálculo de ELO y Fair Play Score ocurre dentro de la base de datos, no en el cliente. Los triggers de PostgreSQL garantizan:
- **Idempotencia** — un resultado solo mueve el rating una vez, incluso ante reintentos.
- **Atomicidad** — ELO y FPS se actualizan en la misma transacción que el resultado.

### RPCs para evitar Race Conditions
Operaciones críticas como `accept_match_proposal` y `submit_match_result` se ejecutan como funciones RPC en Supabase. Esto previene condiciones de carrera cuando dos capitanes interactúan simultáneamente con el mismo partido.

---

## Estructura del Proyecto

```
tornear/
├── app/                    # Screens y routing (Expo Router)
│   ├── (tabs)/             # 5 tabs: Home, Mercado, Ranking, Partidos, Perfil
│   └── (modals)/           # Modales: chat, crear publicación, unirse como invitado
├── components/
│   ├── ui/                 # Componentes base reutilizables
│   └── [domain]/           # Componentes por feature (market/, ranking/, matches/, profile/)
├── lib/                    # Data Access Layer — todas las queries a Supabase
├── stores/                 # Zustand stores
├── context/                # AuthContext (sesión global)
├── hooks/                  # Custom hooks
└── types/                  # Tipos TypeScript (supabase.ts auto-generado)
```

---

## Desarrollo

```bash
# Desde el directorio tornear/
npm install
npm start          # Inicia el servidor de Expo

npm run lint       # ESLint
npm test           # Vitest (unit tests en lib/**/*.test.ts)
npx tsc --noEmit   # Type-check sin compilar
```

Para compilar la versión de producción:

```bash
eas build --platform android --profile production
eas build --platform ios --profile production
```

---

## Roadmap — v1.1

- **Login con Google** — OAuth social via Supabase Auth.
- **Cancelación con doble consentimiento** — Ambos capitanes deben confirmar la cancelación para evitar penalizaciones injustas de FPS.
- **Notificaciones in-app** — Centro de notificaciones persistente dentro de la app.
- **Estadísticas avanzadas** — Gráficos de evolución de ELO y rachas por equipo/jugador.
- **Torneos** — Gestión de llaves y fixture para competencias organizadas.
