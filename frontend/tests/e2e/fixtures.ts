import { test as base, expect, Page, APIRequestContext } from '@playwright/test'

/**
 * Shared test fixtures for glocal30Hub E2E tests.
 *
 * - `loginAs(email)`: dev-login via API, then inject token into localStorage so
 *    the next page navigation is authenticated.
 * - `apiRequest`: pre-authenticated request context bound to a role.
 *
 * Test users come from `backend/seed.py`:
 *   admin@test.com           — admin role
 *   professor@test.com       — professor (KOCCA + NRF lead)
 *   student1@test.com        — student (KOCCA member)
 *   student2@test.com        — student (KOCCA + NRF member)
 *   student3@test.com        — student (NRF member)
 *   external@company.com     — external (KOCCA viewer)
 */

export const TEST_USERS = {
  admin: 'admin@test.com',
  professor: 'professor@test.com',
  student1: 'student1@test.com',
  student2: 'student2@test.com',
  student3: 'student3@test.com',
  external: 'external@company.com',
} as const

export type TestUserKey = keyof typeof TEST_USERS

export const SEED_IDS = {
  admin: '00000000-0000-0000-0000-000000000000',
  professor: '00000000-0000-0000-0000-000000000001',
  student1: '00000000-0000-0000-0000-000000000002',
  student2: '00000000-0000-0000-0000-000000000003',
  student3: '00000000-0000-0000-0000-000000000004',
  external: '00000000-0000-0000-0000-000000000005',
  kocca: '00000000-0000-0000-0000-000000000010',
  nrf: '00000000-0000-0000-0000-000000000011',
} as const

const API_BASE = 'http://127.0.0.1:8000'

interface DevLoginResponse {
  access_token: string
  token_type: string
  user: { id: string; email: string; name: string; role: string }
}

/**
 * Call dev-login and return token + user info.
 * Requires DEBUG=true on backend.
 */
export async function devLogin(
  request: APIRequestContext,
  email: string,
): Promise<DevLoginResponse> {
  const resp = await request.post(`${API_BASE}/api/v1/auth/dev-login`, {
    data: { email },
  })
  expect(resp.ok(), `dev-login failed for ${email} (${resp.status()})`).toBeTruthy()
  return resp.json()
}

/**
 * Login a page as a known seed user. Sets the token in localStorage via
 * `addInitScript` so it's present BEFORE any React code runs on the next nav.
 *
 * Returns the token + user object so callers can do API calls with the same identity.
 */
export async function loginAs(
  page: Page,
  request: APIRequestContext,
  userKey: TestUserKey,
): Promise<DevLoginResponse> {
  const data = await devLogin(request, TEST_USERS[userKey])
  await page.addInitScript((token: string) => {
    window.localStorage.setItem('token', token)
  }, data.access_token)
  return data
}

/**
 * Helper to make an authenticated API call from inside a test.
 */
export async function apiGet(
  request: APIRequestContext,
  token: string,
  path: string,
) {
  return request.get(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

/**
 * Navigate to a path and wait for the page to actually render the expected
 * text. The Vite dev server occasionally serves a "로딩 중..." stub on the
 * first hit after HMR — this helper waits for the API response that the page
 * needs and reloads once if the SPA is still stuck.
 */
export async function gotoAndWait(
  page: Page,
  path: string,
  expectedText?: string,
  apiPathPattern?: string | RegExp,
) {
  const waitForApi = apiPathPattern
    ? page.waitForResponse(
        (resp) => {
          const url = resp.url()
          if (typeof apiPathPattern === 'string') return url.includes(apiPathPattern)
          return apiPathPattern.test(url)
        },
        { timeout: 10_000 },
      )
    : null

  await page.goto(path, { waitUntil: 'domcontentloaded' })
  if (waitForApi) {
    try {
      await waitForApi
    } catch {
      /* fall through to reload below */
    }
  }
  await page.waitForTimeout(800)

  if (expectedText) {
    try {
      await page.getByText(expectedText, { exact: false }).first().waitFor({ timeout: 8000 })
    } catch {
      // Stuck on loading? Reload once and try again.
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
      await page.getByText(expectedText, { exact: false }).first().waitFor({ timeout: 8000 })
    }
  }
}

export const test = base
export { expect }
