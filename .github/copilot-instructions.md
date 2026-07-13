# Project Guidelines

## Scope
- This workspace contains reference materials at repo root, but all app development work happens in `tornear/`.
- Run commands from `tornear/` unless a task explicitly targets root docs or mockups.

## Code Style
- Use TypeScript strict patterns; avoid `any`.
- Prefer inferred types from Zod schemas (`z.infer`) and Supabase generated types in `types/supabase.ts`.
- Use `@/` path aliases for app imports.
- Keep screen components thin and move data/query logic to `lib/`.

## Architecture
- Routing/screens: `app/` (tabs in `app/(tabs)/`, modal routes in `app/(modals)/`).
- Data access layer: `lib/` (`*-api.ts`, `*-data.ts`, `schemas/`); do not query Supabase directly from UI components.
- Reusable UI primitives: `components/ui/`; feature UI: `components/<domain>/`.
- Global auth/session state: `context/AuthContext.tsx`; team selection state: `stores/teamStore.ts`.

## Build And Test
- `npm start` (Expo dev server)
- `npm run android` / `npm run ios` / `npm run web`
- `npm run lint`
- `npm test` / `npm run test:watch`
- `npx tsc --noEmit`

## Conventions
- Styling uses NativeWind (`className`); avoid `StyleSheet.create` for new code.
- For tab screens, follow the profile tab pattern:
  - Fetch consolidated view data via a single `fetch[Domain]ViewData(...)` function in `lib/`.
  - Refresh with `useFocusEffect` + `useCallback`.
  - Compose sections from `components/<domain>/`.
- Use app modal routes for modal flows rather than ad hoc React Native `Modal` patterns where routing is expected.
- Return formatted errors from data helpers and map to user-facing messages via shared helpers.

## Key References
- Primary implementation guide: `tornear/CLAUDE.md`
- Feature and architecture overview: `tornear/README.md`
- Database schema and policies: `docs/schema.sql`
- Current technical debt and roadmap context: `docs/auditoria.md`
- UX/UI audit findings: `docs/auditoria-ux-ui.md`
- Design tokens and palette context: `docs/color-palette.md`
