# Better Fit Notes - Architecture & Tech Stack

**Audience:** UX/UI & Frontend Experts  
**Version:** 1.0  
**Format:** PWA Mobile-First

---

## 📊 Tech Stack Overview

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | React 19 + TypeScript | UI components & type safety |
| **Build** | Vite 8 | Fast bundling with code splitting |
| **Styling** | Tailwind CSS 3 | Utility-first, dark mode support |
| **Routing** | React Router 7 | SPA navigation |
| **State** | Zustand 5 | Global app state (lightweight) |
| **Data Fetching** | React Query 5 | Server state sync & caching |
| **Offline DB** | Dexie 4 + IndexedDB | Local-first persistence |
| **Backend** | Supabase | Auth, DB, real-time sync |
| **Forms** | React Hook Form 7 + Zod 4 | Validation & performance |
| **Charts** | Recharts 3 | Analytics visualizations |
| **Icons** | Lucide React 1.8 | SVG icon library |
| **PWA** | Workbox 7 + Manifest | Offline functionality & installability |

---

## 🏗️ Architecture Pattern: Domain-Driven Design

```
src/
├── components/layout          # Shell, Header, BottomNav, Offline Banner
├── components/ui              # Reusable UI primitives (Button, Modal, Toast, etc.)
├── domains/                   # Feature domains (each self-contained)
│   ├── analytics/             # Charts, stats pages
│   ├── auth/                  # Authentication & user management
│   ├── exercises/             # Exercise catalog & CRUD
│   ├── history/               # Historical data & reporting
│   ├── sessions/              # Active workout sessions
│   ├── settings/              # User preferences & config
│   └── templates/             # Workout templates
├── pages/                     # Full-page route components
├── stores/                    # Global Zustand stores (auth, session, settings)
├── lib/                       # Utilities (Supabase, PWA, sync, validators)
├── types/                     # Shared type definitions
└── db/                        # Dexie schema & DB setup
```

### Domain Structure (Example: `sessions/`)
```
domains/sessions/
├── components/
│   ├── AddExerciseSheet.tsx   # Bottom sheet UI component
│   ├── ExerciseBlock.tsx      # Exercise display/edit
│   └── SetRow.tsx            # Set tracking UI
├── hooks/
│   └── useActiveSession.ts    # Session business logic hook
└── types/ (implicit via shared /types)
```

**Principle:** Each domain encapsulates UI + business logic for a feature. Domains communicate via zustand stores & shared types.

---

## 🔄 State Management Architecture

### 1. **Global State** (Zustand Stores)
```typescript
// stores/sessionStore.ts - Active session UI state
{
  activeSessionId: string | null,      // Currently tracked session
  restTimerSeconds: number,            // Rest countdown
  restTimerActive: boolean             // Timer running state
}

// stores/authStore.ts
// stores/settingsStore.ts
```
**Use case:** UI state, app-wide toggles, temp data  
**Characteristics:** Minimal, synchronous, no side effects

### 2. **Server State** (React Query)
- Fetches from Supabase
- Auto-caching with 5-min stale time
- Retry strategy (1 retry on failure)
- Integrates with offline sync

### 3. **Client DB** (Dexie + IndexedDB)
- Local-first persistence for offline functionality
- Syncs with Supabase when online
- Real-time hooks via `dexie-react-hooks`

---

## 📱 Data Flow: Offline-First Architecture

```
User Action
    ↓
React Component (hooks + state)
    ↓
Dexie Local DB (IndexedDB) ← Always writes here first
    ↓
Supabase (when online) ← Async sync
    ↓
React Query Cache ← Invalidate on sync
```

**Key file:** `lib/sync.ts` - Orchestrates offline-first sync logic

---

## 🎨 UI Component System

### Component Hierarchy
```
AppShell (Root Layout)
├── Header
├── Pages (Route views)
│   └── Domain components (sessions, exercises, etc.)
│   └── UI primitives
├── BottomNav (Mobile navigation)
└── OfflineBanner (Connection status)
```

### UI Primitives (`components/ui/`)
- **Button** - All button variants (solid, ghost, outline)
- **Input** - Form inputs with validation feedback
- **Modal** - Centered overlay dialog
- **BottomSheet** - Mobile sheet for actions
- **Badge** - Tags/labels
- **Skeleton** - Loading placeholders
- **Toast** - Notifications
- **EmptyState** - Null state UI

**Style approach:** Tailwind utility classes + custom components  
**Theme:** Dark mode support via `dark:` prefix + CSS class toggle

---

## 🚀 Build & Code Splitting Strategy

### Vite Configuration
```typescript
// Manual chunks for dependency isolation
├── charts       (recharts)
├── supabase     (@supabase/supabase-js)
├── db           (dexie)
├── forms        (react-hook-form, @hookform, zod)
├── router       (react-router)
├── query        (@tanstack/react-query)
├── utils        (date-fns, lucide-react, clsx)
└── react        (react, react-dom)
```

**Why:** Optimize bundle size for mobile; vendors change less frequently

### Build Pipeline
```bash
npm run build  # tsc -b && vite build
```
- TypeScript compilation with project references
- Vite optimizes for production
- Chunk size warning limit: 600KB

---

## 🔐 Authentication Flow

1. User signs up/logs in on `AuthPage`
2. Supabase handles session (JWT in localStorage)
3. `useAuthInit()` hook restores session on app load
4. Auth state stored in Zustand (`authStore`)
5. Protected routes check `authStore.user`

**Security:** Tokens managed by Supabase, rotation handled automatically

---

## 🔊 Real-Time & Sync Mechanisms

### Offline Detection
- `OfflineBanner` component monitors connection
- Uses browser `online`/`offline` events
- UI reflects sync status

### Sync Strategy (`lib/sync.ts`)
- Queue operations while offline in Dexie
- On reconnect: re-sync queued changes
- Conflict resolution: Client state wins
- React Query invalidates stale data

---

## 📊 Form Validation Pattern

```typescript
// Combination: React Hook Form (performance) + Zod (type-safe schemas)
const schema = z.object({
  exerciseName: z.string().min(1),
  sets: z.number().int().positive(),
  reps: z.number().int().positive(),
});

const { register, handleSubmit, formState } = useForm({
  resolver: zodResolver(schema),
});
```

**Why:** Zod provides runtime validation + TypeScript inference  
**Performance:** React Hook Form minimizes re-renders

---

## 🎯 Performance Optimizations

### Bundle Splitting
- Lazy-loaded chart vendor code
- Separate Supabase client bundle
- Form validators isolated

### Rendering
- Zustand for minimal re-renders (selector pattern)
- React Query deduplication & caching
- Memoization where needed (domain-specific)

### Debouncing
- Search inputs use `useDebounce(query, 200ms)`
- Prevents excessive database queries

### Skeleton Loaders
- No full-page spinners
- Progressive content loading with `<Skeleton />`

---

## 📲 PWA Features

### Service Worker (`public/sw.js`)
- Installed via Workbox (`workbox-window`)
- Registered in `lib/registerSW.ts`
- Offline page caching strategy

### App Manifest (`public/manifest.json`)
- Home screen installation
- App name, icons, theme colors
- Start URL: `/`

---

## 🎭 Theme System

### Dark Mode Implementation
```typescript
// In App.tsx
function applyTheme(theme: 'dark' | 'light' | 'system') {
  root.classList.toggle('dark', isDark);
}

// Settings store tracks user preference
// Listens to system preference changes if 'system' mode active
```

**CSS Integration:** Tailwind `dark:` modifier + CSS custom properties

---

## 🔗 Router Structure

```typescript
/                      → CalendarPage (default)
/sessions/:id          → SessionPage (active workout)
/exercises             → ExercisesPage (catalog)
/analytics             → AnalyticsPage (charts)
/history               → HistoryPage (past sessions)
/templates             → TemplatesPage (presets)
/settings              → SettingsPage (preferences)
/auth                  → AuthPage (login/signup)
```

**Navigation:** 
- Top header for desktop metaphors
- Bottom nav for mobile (BottomNav component)

---

## 🧪 Development Workflow

```bash
# Dev server with HMR
npm run dev          # Runs on :3000

# Type checking + linting
npm run lint         # ESLint

# Production build
npm run build        # Type-check + optimize
npm run preview      # Local production preview
```

---

## 📋 Type Safety

### Shared Types (`types/entities.ts`)
- Exercise, Session, Set, User models
- Exported across domains
- Single source of truth

### TypeScript Config
- Strict mode enabled
- Path alias: `@/` = `src/`
- Targets ES2020

---

## 🚧 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Zustand over Redux** | Simpler API, smaller bundle, sufficient for app complexity |
| **Dexie over plain IndexedDB** | Simplified async API, better TypeScript support |
| **React Hook Form + Zod** | Minimal re-renders + runtime type validation |
| **Domain-driven folders** | Scalability, feature teams can work independently |
| **PWA-first** | Offline-critical for fitness tracking app |
| **Recharts** | Lightweight, React-native charting library |
| **Tailwind CSS** | Mobile-first, dark mode built-in, no style bloat |

---

## 🎯 Next Steps for Frontend Teams

### Common Tasks
- **Add new domain:** Create `domains/[feature]/` with components/ + hooks/
- **Add UI component:** Create in `components/ui/`, export from central index
- **Add route:** Update React Router config in App.tsx
- **Optimize bundle:** Check `vite.config.ts` chunk strategy
- **Theme tweaks:** Modify Tailwind config + Lucide icon set

### Performance Audits
- Lighthouse (PWA, accessibility)
- Bundle analysis: `vite build --report`
- React DevTools Profiler for render bottlenecks

---

## 📖 Resources

- **Vite:** https://vitejs.dev
- **React 19:** https://react.dev
- **React Router:** https://reactrouter.com
- **Zustand:** https://github.com/pmndrs/zustand
- **React Query:** https://tanstack.com/query
- **Tailwind:** https://tailwindcss.com
- **Dexie:** https://dexie.org
- **Zod:** https://zod.dev

---

**Last Updated:** April 2026  
**Maintainer:** Frontend Team
