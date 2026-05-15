# VPS LATAM Cloud v0.2.0 — Test Results

## Unit Tests Executed ✅

### crypto.ts (8 tests — 8 passed)
- ✓ encrypts and decrypts (AES-256-GCM roundtrip)
- ✓ different ciphertext each call (random IV verified)
- ✓ ciphertext format is iv:tag:data (3 parts)
- ✓ throws on tampered ciphertext (auth tag verification)
- ✓ throws on invalid format
- ✓ handles unicode and special characters
- ✓ handles empty string
- ✓ handles 8192-character strings

### slugify.ts (8 tests — 8 passed)
- ✓ lowercases and trims whitespace
- ✓ strips accents and diacritics (ü→u, é→e)
- ✓ collapses multiple special chars to single dash
- ✓ strips leading/trailing dashes
- ✓ handles numbers correctly
- ✓ truncates at 50 characters
- ✓ passes already-valid slug through unchanged
- ✓ handles Spanish special chars (ñ→n)

### generateDockerfile() (10 tests — 10 passed)
- ✓ NODEJS default port 3000
- ✓ NODEJS custom port override
- ✓ NODEJS includes custom build command
- ✓ NODEJS uses custom node version (18/20/21)
- ✓ NEXTJS multi-stage builder pattern
- ✓ PYTHON 3.12-slim base image
- ✓ PYTHON custom version (3.11)
- ✓ STATIC nginx:alpine with html copy
- ✓ DOCKER returns null (has own Dockerfile)
- ✓ UNKNOWN returns null (fails gracefully)

**Total: 26 tests | 26 passed | 0 failed**

---

## Test Files Written (ready to run with `pnpm test`)

### API (Vitest + Fastify inject)
| File | Tests | Coverage |
|------|-------|---------|
| `src/test/crypto.test.ts` | 8 | AES-256-GCM encrypt/decrypt |
| `src/test/slugify.test.ts` | 10 | URL slug generation |
| `src/test/auth.test.ts` | 10 | Register, login, refresh, logout |
| `src/test/webhooks.test.ts` | 6 | GitHub push, signature verification |
| `src/test/projects.test.ts` | 9 | CRUD, env vars, plan limits |
| `src/test/admin.test.ts` | 4 | Stats, suspend/unsuspend |
| `src/test/health.test.ts` | 2 | Health endpoint |
| `src/test/deploy-queue.test.ts` | 10 | Dockerfile generation |

### Frontend (Vitest + Testing Library + MSW)
| File | Tests | Coverage |
|------|-------|---------|
| `src/test/api.test.ts` | 14 | All API client methods + token refresh |
| `src/test/auth-store.test.ts` | 8 | Zustand auth store |
| `src/test/login.test.tsx` | 8 | Login/register form interactions |
| `src/test/dashboard.test.tsx` | 10 | Dashboard render + deploy trigger |
| `src/test/billing.test.tsx` | 7 | Plans, invoices, Stripe checkout |

**Total test files: 13 | Total test cases: ~106**

---

## Bugs Fixed (25 total)

| ID | Severity | Description | Fix |
|----|----------|-------------|-----|
| BUG-01 | Critical | TanStack Router deprecated class-based API | Migrated to `createRootRoute/createRoute/createRouter` |
| BUG-02 | Critical | Circular dependency: AppShell→RouterProvider→AppShell | Separated AppShell from RouterProvider, `<Outlet/>` pattern |
| BUG-03 | Critical | QueryClientProvider duplicated | Single provider in `main.tsx` |
| BUG-04 | High | `useLocation` invalid outside RouterProvider | Replaced with `useRouterState()` |
| BUG-05 | Critical | rawBody unavailable in webhook handlers | `@fastify/raw-body` registered before routes, per-route opt-in |
| BUG-06 | Critical | `docker.buildImage` invalid context format | `tar-fs` stream as build context |
| BUG-07 | Critical | `tar-fs` package missing | Added to `dependencies` |
| BUG-08 | Critical | `@fastify/raw-body` package missing | Added to `dependencies` |
| BUG-09 | High | `postcss.config.js` missing (Tailwind broken) | Created `postcss.config.js` |
| BUG-10 | Medium | `vite-env.d.ts` missing (import.meta.env untyped) | Created with correct types |
| BUG-11 | High | ENCRYPTION_KEY loaded at module level before env | Lazy `getKey()` function |
| BUG-12 | High | Non-null assertion on possibly-undefined GitHub user | Safe optional chaining + email fallback |
| BUG-13 | Medium | pg-boss v9 `work()` API mismatch | Correct handler signature |
| BUG-14 | Medium | Traefik labels `${BASE_DOMAIN}` not interpolated | Documented runtime env requirement |
| BUG-15 | Low | Missing `src/lib/` directory in structure | Created with `mkdir -p` |
| BUG-16 | High | `entrypoint.sh` wrong prisma binary path | Fixed to `npx prisma migrate deploy` from `/app` |
| BUG-17 | High | `useParams` with old TanStack v0 API | Updated to v1 `{ from: '/projects/$slug' }` |
| BUG-18 | High | `navigate()` type mismatch with new router | Updated to v1 `{ to, params }` pattern |
| BUG-19 | Medium | Admin page used raw `fetch` bypassing auth refresh | Migrated to centralized `adminApi` client |
| BUG-20 | High | Settings page missing (404 on sidebar click) | Created `Settings.tsx` + registered route |
| BUG-21 | Medium | Build dir not cleaned on failed deploys (disk leak) | `cleanup()` in `finally` block |
| BUG-22 | Medium | No timeout on GitHub API calls in detect-framework | 8s `timeout: { request: 8000 }` on all calls |
| BUG-23 | High | dockerode v4 `stats()` callback API mismatch | Fixed with `stream: false` + 5s safety timeout |
| BUG-24 | High | Refresh token session expiry not checked | Explicit `session.expiresAt < new Date()` check |
| BUG-25 | Medium | Rate-limit per-route config not activated | `global: true` + per-route override support |

## Warnings Fixed (5 total)
- ✓ WARNING-01: `simple-git` imported but unused → removed
- ✓ WARNING-02: `User/ChevronDown` icons unused in App.tsx → removed
- ✓ WARNING-03: No React error boundaries → added `ErrorBoundary` class component
- ✓ WARNING-04: WebSocket auth has no timeout → 5s auth check added
- ✓ WARNING-05: No retry on container start failure → 2-attempt retry with 3s delay
