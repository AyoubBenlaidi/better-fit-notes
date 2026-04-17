# Better Fit Notes - Architecture

This document describes the architecture that is actually implemented in the codebase as of April 2026.

The application is a connected-first SPA. Offline mode has been intentionally removed.

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| UI | React 19 + TypeScript | SPA, typed components and hooks |
| Build | Vite 8 | Dev server on port 3000, manual chunk splitting |
| Styling | Tailwind CSS 3 | Mobile-first utility styling |
| Routing | React Router 7 | BrowserRouter with protected routes |
| Client state | Zustand 5 | Small UI state only |
| Server state | React Query 5 | In-memory query cache |
| Backend | Supabase | Auth + database access |
| Forms | React Hook Form 7 + Zod 4 | Validation and performant forms |
| Charts | Recharts 3 | Analytics visualizations |

## What The App Is Not

- No offline-first architecture
- No IndexedDB or Dexie data mirror in active code paths
- No persisted React Query cache
- No active service worker registration
- No offline banner or reconnect queue

Some legacy files and dependencies still exist for compatibility or cleanup, but they are not part of the runtime architecture.

## High-Level Structure

```text
src/
  components/
    layout/        shell, header, bottom nav
    ui/            reusable primitives
  domains/
    analytics/
    auth/
    exercises/
    history/
    sessions/
    settings/
    templates/
  hooks/
  lib/             API client, utilities, startup cleanup
  pages/           route-level pages
  stores/          Zustand stores
  types/           shared entities
```

### Architectural Rule

Feature logic lives in `domains/*`, page composition lives in `pages/*`, and raw backend access stays centralized in `src/lib/api.ts`.

## Runtime Flow

### Startup

1. `src/main.tsx` boots the app.
2. Legacy client cleanup runs before render.
3. Old service workers are unregistered and browser caches are cleared.
4. React mounts `App`.
5. `useAuthInit()` restores the Supabase session.
6. On foreground recovery, a lightweight refresh lock stays active until the first visible queries settle.
7. Protected routes render only after auth loading resolves.

### Data Flow

```text
Page component
  -> domain hook
  -> src/lib/api.ts
  -> Supabase
  -> mutation invalidates relevant React Query keys
  -> subscribed screens refresh from server state
```

### Route Model

| Route | Page |
|------|------|
| `/` | CalendarPage |
| `/session/:id` | SessionPage |
| `/exercises` | ExercisesPage |
| `/analytics` | AnalyticsPage |
| `/history` | HistoryPage |
| `/templates` | TemplatesPage |
| `/settings` | SettingsPage |
| `/auth` | AuthPage |

All main routes are wrapped in `RequireAuth`.

## State Management

### Zustand Stores

#### `authStore`

- In-memory only
- Holds `user` and `isLoading`
- Mirrors resolved Supabase auth state for routing and UI

#### `sessionStore`

- In-memory only
- Holds active session UI details such as `activeSessionId` and rest timer state
- Cleared on refresh and sign out

#### `settingsStore`

- Persisted in `localStorage` as `bfn-settings`
- Stores theme, date format, weight unit and first day of week
- Used by the startup theme script in `index.html`

### React Query

- Cache is in memory only
- Default `staleTime` is 5 minutes
- Default retry count is 1
- Cache is not persisted across reloads
- Mutations rely on targeted invalidation rather than global refetch on startup
- Foreground recovery refetches active queries and temporarily blocks taps until they settle

This is important for correctness: refresh should rebuild state from Supabase, not from old local cache.

## Browser Storage Policy

| Storage | Used For | Persistence |
|--------|----------|-------------|
| `localStorage` | `bfn-settings` theme/preferences | Yes |
| `localStorage` | Supabase auth session keys | Managed by SDK |
| React Query persistence | Not used | No |
| Auth Zustand persistence | Not used | No |
| Session Zustand persistence | Not used | No |
| IndexedDB | Not used by active app flow | No |

## Service Worker Policy

The app does not run with a service worker.

Implementation details:

- `src/lib/registerSW.ts` removes legacy local cache keys and unregisters service workers on startup
- `public/sw.js` is a self-unregistering cleanup worker kept only to clean up older installs already in the wild
- `index.html` no longer links a manifest, so the web app is not presented as an installable PWA entry point

If service workers come back later, they must be reintroduced as a deliberate architecture change, not as an isolated file edit.

## Authentication

Authentication is fully handled through Supabase.

Flow:

1. User signs in, signs up, requests a magic link or resets a password in `AuthPage`
2. Supabase stores and refreshes the session token
3. `useAuthInit()` loads and validates the current session on app startup
4. Zustand mirrors the resolved auth user for routing and UI
5. On sign out, local leftovers are cleared and query cache is reset

If Supabase environment variables are missing, the app does not enter an offline fallback anymore. It simply cannot authenticate or load protected data.

## Data Access Layer

`src/lib/api.ts` is the central boundary for backend CRUD.

Responsibilities:

- Convert camelCase app models to snake_case database payloads
- Parse rows from Supabase into app entities
- Wrap Supabase queries for sessions, exercises, sets, templates, settings and analytics inputs
- Batch insert imported data for CSV import

This keeps domain hooks thin and prevents Supabase access from leaking across the UI tree.

## UI Composition

### Layout

- `AppShell` provides the common mobile shell
- `BottomNav` is always visible on main authenticated routes
- `Header` is used selectively by pages that need a page title or actions
- `ToastContainer` is mounted once in the shell

### Domain Ownership

- `domains/sessions` handles active workout manipulation
- `domains/exercises` handles exercise CRUD and muscle group interactions
- `domains/auth` handles login flows and auth bootstrap
- `domains/analytics` handles chart composition and metric shaping

## Performance Notes

- Vite manual chunking separates `react`, `router`, `query`, `forms`, `supabase`, `charts` and `utils`
- Chart code is isolated into a separate vendor chunk
- Query invalidation is targeted to avoid unnecessary full-app refreshes
- Removing persisted caches and hydration gates improved refresh and navigation consistency

## Operational Guidance

### If You Change Startup Behavior

Review these files together:

- `src/main.tsx`
- `src/App.tsx`
- `src/lib/registerSW.ts`
- `src/domains/auth/hooks/useAuth.ts`

### If You Change Storage Or Caching

Keep these rules intact unless you are intentionally redesigning the architecture:

- Do not persist React Query cache
- Do not persist auth or session Zustand stores
- Keep the boot/foreground interaction lock tied to real query recovery, not a fixed timeout alone
- Do not add offline fallback text or behavior without rebuilding the full data model around it

### If You Add New Data Fetching

- Add the raw Supabase call in `src/lib/api.ts`
- Wrap it in a domain hook or page query
- Use stable React Query keys
- Invalidate only the affected keys after mutation

## Known Legacy Artifacts

- `public/sw.js` exists for cleanup, not for runtime caching
- `public/manifest.json` still exists in the repository but is not linked from the current HTML entrypoint
- Some older packages such as `dexie`, `dexie-react-hooks`, `workbox-window` and React Query persistence packages may still exist in `package.json` even though the active runtime no longer depends on them

These should be treated as cleanup candidates, not active architecture.

## Last Updated

April 2026
