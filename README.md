# Better Fit Notes

Better Fit Notes is a mobile-first workout tracking SPA built with React, TypeScript and Supabase.

The application is connected-first. It does not support offline mode anymore.

## Product Scope

- Authentication with Supabase
- Workout sessions and live set tracking
- Exercise library and muscle groups
- Templates
- History and analytics
- CSV import from FitNotes and JSON/CSV export

## Current Runtime Model

- Server data lives in Supabase
- React Query caches server data in memory only
- `authStore` and `sessionStore` are in-memory only
- `settingsStore` is the only Zustand store persisted to `localStorage`
- Supabase manages its own auth session in browser storage
- Service workers are actively disabled and cleaned up on startup
- Initial hard refresh relies on normal page loading states, not a global interaction lock

This is intentional. Previous local cache and pseudo-offline behavior caused stale refreshes, inconsistent navigation and leftover client state across deployments.

## Stack

- React 19
- TypeScript
- Vite 8
- React Router 7
- Zustand 5
- React Query 5
- Supabase
- React Hook Form + Zod
- Tailwind CSS
- Recharts

## Local Development

### Requirements

- Node.js 20+
- npm
- A Supabase project with the expected tables and auth enabled

### Environment Variables

Create a `.env.local` file with:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Without these variables, auth and data loading will not work.

### Commands

```bash
npm install
npm run dev
npm run build
npm run preview
npm run lint
```

The Vite dev server runs on port `3000`.

## Routing

- `/` - calendar and session overview
- `/session/:id` - active workout session
- `/exercises` - exercise catalog
- `/analytics` - analytics dashboards
- `/history` - session history
- `/templates` - workout templates
- `/settings` - preferences, import/export, account actions
- `/auth` - sign in, sign up, magic link, password reset

## Storage and Cache Policy

### Persisted in browser storage

- `bfn-settings` for theme and user preferences
- Supabase auth session keys managed by the SDK

### Not persisted anymore

- React Query cache
- Auth Zustand store
- Session Zustand store
- Any offline queue or IndexedDB mirror

### Service worker policy

- No active service worker registration
- Startup unregisters old service workers and clears browser caches
- `public/sw.js` exists only as a cleanup worker for previously installed clients

## Refresh Safety

- Auth recovery always validates the current Supabase session before trusting browser state
- Startup rebuilds state through the normal page queries instead of reviving a persisted client cache
- Foreground recovery refreshes the Supabase session once and refetches only active queries
- The active session screen shows its own subtle loader while visible session data is being refreshed
- Session pages only reload the metadata required by the current session, which avoids depending on a full catalog cache after reload

## Data Flow

```text
React page/component
  -> domain hook
  -> src/lib/api.ts
  -> Supabase
  -> React Query invalidation / refetch
```

The app is optimized for fresh server state and predictable refresh behavior, not for offline resilience.

## Project Structure

```text
src/
  components/
    layout/
    ui/
  domains/
    analytics/
    auth/
    exercises/
    history/
    sessions/
    settings/
    templates/
  hooks/
  lib/
  pages/
  stores/
  types/
```

## Important Files

- `src/App.tsx` - router and query client wiring
- `src/main.tsx` - app bootstrap and legacy client cleanup
- `src/lib/api.ts` - all Supabase CRUD access
- `src/lib/registerSW.ts` - disables legacy service workers and clears caches
- `src/stores/authStore.ts` - in-memory auth UI state
- `src/stores/sessionStore.ts` - in-memory session UI state
- `src/stores/settingsStore.ts` - persisted user preferences

## Notes for Contributors

- Do not reintroduce offline behavior partially. If offline support comes back, it must be designed end-to-end.
- Do not persist React Query cache in `localStorage`.
- Do not persist session or auth UI state outside Supabase session handling.
- Keep refresh handling simple: one auth bootstrap path, one foreground recovery path, and page-local loaders where needed.
- If startup or refresh behavior changes, review `src/main.tsx`, `src/lib/registerSW.ts` and `src/App.tsx` together.

## Additional Documentation

- See `ARCHITECTURE.md` for a code-oriented architecture summary.

## Last Updated

April 2026
