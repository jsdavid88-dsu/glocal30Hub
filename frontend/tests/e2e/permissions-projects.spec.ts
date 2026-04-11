/**
 * Permission scenarios for project list + detail endpoints.
 *
 * Regression coverage for:
 *  - #4 external sees all projects (list filtering)
 *  - #7 GET /api/v1/projects/{id} bypasses external permission filtering
 *  - #8 student can access projects they're not a member of
 *
 * Policy (confirmed in #10 review):
 *  - admin + professor: see ALL projects
 *  - student + external: see ONLY projects they're members of
 */
import { test, expect, loginAs, apiGet, gotoAndWait, SEED_IDS } from './fixtures'

test.describe('Permissions: project list + detail', () => {
  test.describe('admin', () => {
    test('sees all projects via API and UI', async ({ page, request }) => {
      const { access_token } = await loginAs(page, request, 'admin')

      // API: 2 projects (KOCCA + NRF)
      const apiResp = await apiGet(request, access_token, '/api/v1/projects/')
      expect(apiResp.ok()).toBeTruthy()
      const apiBody = await apiResp.json()
      const names: string[] = (apiBody.data ?? []).map((p: { name: string }) => p.name)
      expect(names.some((n) => n.includes('KOCCA'))).toBeTruthy()
      expect(names.some((n) => n.includes('NRF'))).toBeTruthy()

      // UI: navigate and verify both names rendered
      await gotoAndWait(page, '/projects', 'KOCCA', '/api/v1/projects/')
      await expect(page.getByText('NRF', { exact: false })).toBeVisible({ timeout: 10_000 })
    })

    test('can access NRF detail directly', async ({ page, request }) => {
      const { access_token } = await loginAs(page, request, 'admin')
      const resp = await apiGet(request, access_token, `/api/v1/projects/${SEED_IDS.nrf}`)
      expect(resp.ok()).toBeTruthy()
      const body = await resp.json()
      expect(body.name).toContain('NRF')
    })
  })

  test.describe('professor', () => {
    test('sees all projects (lab oversight policy)', async ({ page, request }) => {
      const { access_token } = await loginAs(page, request, 'professor')

      const apiResp = await apiGet(request, access_token, '/api/v1/projects/')
      const apiBody = await apiResp.json()
      const names: string[] = (apiBody.data ?? []).map((p: { name: string }) => p.name)
      expect(names.some((n) => n.includes('KOCCA'))).toBeTruthy()
      expect(names.some((n) => n.includes('NRF'))).toBeTruthy()

      await page.goto('/projects')
      await expect(page.getByText('KOCCA', { exact: false })).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText('NRF', { exact: false })).toBeVisible({ timeout: 10_000 })
    })

    test('can access NRF detail directly', async ({ request, page }) => {
      const { access_token } = await loginAs(page, request, 'professor')
      const resp = await apiGet(request, access_token, `/api/v1/projects/${SEED_IDS.nrf}`)
      expect(resp.ok()).toBeTruthy()
    })
  })

  test.describe('student1 (KOCCA member only)', () => {
    test('list shows ONLY KOCCA — NRF must be hidden (#8)', async ({ page, request }) => {
      const { access_token } = await loginAs(page, request, 'student1')

      // API: only 1 project, KOCCA
      const apiResp = await apiGet(request, access_token, '/api/v1/projects/')
      const apiBody = await apiResp.json()
      const names: string[] = (apiBody.data ?? []).map((p: { name: string }) => p.name)
      expect(names).toHaveLength(1)
      expect(names[0]).toContain('KOCCA')
      expect(names.some((n) => n.includes('NRF'))).toBeFalsy()

      // UI: KOCCA visible, NRF NOT in DOM
      await gotoAndWait(page, '/projects', 'KOCCA', '/api/v1/projects/')
      await expect(page.getByText('NRF', { exact: false })).toHaveCount(0)
    })

    test('direct NRF detail URL is blocked (#8)', async ({ page, request }) => {
      const { access_token } = await loginAs(page, request, 'student1')

      const resp = await apiGet(request, access_token, `/api/v1/projects/${SEED_IDS.nrf}`)
      expect(resp.status()).toBe(403)

      // sub-resources also blocked
      const members = await apiGet(
        request,
        access_token,
        `/api/v1/projects/${SEED_IDS.nrf}/members`,
      )
      expect(members.status()).toBe(403)
      const tasks = await apiGet(
        request,
        access_token,
        `/api/v1/projects/${SEED_IDS.nrf}/tasks`,
      )
      expect(tasks.status()).toBe(403)
    })

    test('can still access KOCCA (own project)', async ({ page, request }) => {
      const { access_token } = await loginAs(page, request, 'student1')
      const resp = await apiGet(request, access_token, `/api/v1/projects/${SEED_IDS.kocca}`)
      expect(resp.ok()).toBeTruthy()
      const body = await resp.json()
      expect(body.name).toContain('KOCCA')
    })
  })

  test.describe('student2 (KOCCA + NRF member)', () => {
    test('sees both KOCCA and NRF', async ({ page, request }) => {
      const { access_token } = await loginAs(page, request, 'student2')

      const apiResp = await apiGet(request, access_token, '/api/v1/projects/')
      const apiBody = await apiResp.json()
      const names: string[] = (apiBody.data ?? []).map((p: { name: string }) => p.name)
      expect(names.some((n) => n.includes('KOCCA'))).toBeTruthy()
      expect(names.some((n) => n.includes('NRF'))).toBeTruthy()

      // Direct access to both works
      const koccaResp = await apiGet(
        request,
        access_token,
        `/api/v1/projects/${SEED_IDS.kocca}`,
      )
      expect(koccaResp.ok()).toBeTruthy()
      const nrfResp = await apiGet(request, access_token, `/api/v1/projects/${SEED_IDS.nrf}`)
      expect(nrfResp.ok()).toBeTruthy()
    })
  })

  test.describe('external (KOCCA viewer only)', () => {
    test('list shows ONLY KOCCA — NRF must be hidden (#4)', async ({ page, request }) => {
      const { access_token } = await loginAs(page, request, 'external')

      const apiResp = await apiGet(request, access_token, '/api/v1/projects/')
      const apiBody = await apiResp.json()
      const names: string[] = (apiBody.data ?? []).map((p: { name: string }) => p.name)
      expect(names).toHaveLength(1)
      expect(names[0]).toContain('KOCCA')

      await gotoAndWait(page, '/projects', 'KOCCA', '/api/v1/projects/')
      await expect(page.getByText('NRF', { exact: false })).toHaveCount(0)
    })

    test('direct NRF detail URL is blocked (#7)', async ({ page, request }) => {
      const { access_token } = await loginAs(page, request, 'external')

      // detail endpoint
      const detail = await apiGet(request, access_token, `/api/v1/projects/${SEED_IDS.nrf}`)
      expect(detail.status()).toBe(403)

      // members endpoint (PII protection)
      const members = await apiGet(
        request,
        access_token,
        `/api/v1/projects/${SEED_IDS.nrf}/members`,
      )
      expect(members.status()).toBe(403)

      // tasks endpoint
      const tasks = await apiGet(
        request,
        access_token,
        `/api/v1/projects/${SEED_IDS.nrf}/tasks`,
      )
      expect(tasks.status()).toBe(403)
    })

    test('can access KOCCA (own viewer project)', async ({ page, request }) => {
      const { access_token } = await loginAs(page, request, 'external')
      const resp = await apiGet(request, access_token, `/api/v1/projects/${SEED_IDS.kocca}`)
      expect(resp.ok()).toBeTruthy()
    })
  })
})
