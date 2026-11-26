import { expect, test } from '@playwright/test'

// Smoke E2E del shell (sin proveedores externos): la app carga, navega entre
// vistas y no lanza excepciones no capturadas. El camino dorado completo
// (LLM→imagen→TTS→FFmpeg) exige credenciales/env del sandbox y se verifica aparte.
test('el shell carga y navega entre las cuatro vistas', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/')
  await expect(page.getByRole('button', { name: /AirShot — inicio/i })).toBeVisible()

  await page.getByRole('button', { name: 'Biblioteca' }).click()
  await expect(page.getByRole('heading', { name: /Biblioteca/ })).toBeVisible()

  await page.getByRole('button', { name: 'Estilos' }).click()
  await expect(page.getByRole('heading', { name: /Estilos/ })).toBeVisible()

  await page.getByRole('button', { name: 'Sistema' }).click()
  await expect(page.getByRole('heading', { name: 'Sistema' })).toBeVisible()

  await page.getByRole('button', { name: 'Proyectos' }).click()
  await expect(page.getByRole('heading', { name: /Proyectos/ })).toBeVisible()

  expect(pageErrors).toEqual([])
})
