import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';

test.describe('Relic viewer', () => {
  test('index にビューワへのリンクが表示される', async ({ page }) => {
    await page.goto('/');
    const viewerLink = page.getByRole('link', { name: /sample/ });
    await expect(viewerLink).toBeVisible();
    await viewerLink.click();
    await expect(page).toHaveURL(/sample_viewer\.html$/);
  });


  test('ビューア初期化でエラーが発生しない', async ({ page }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (error) => {
      pageErrors.push(error);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.goto('/sample_viewer.html');
    await page.waitForLoadState('networkidle');

    expect(pageErrors, pageErrors.map((error) => error.message).join('\n')).toHaveLength(0);
    expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0);
  });

  test('ビューアの主要な操作が機能する', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.goto('/sample_viewer.html');

    const items = page.locator('.item');
    await expect(items.first()).toBeVisible();
    const initialCount = await items.count();

    const rawLine = page.locator('.raw').first();
    await expect(rawLine).toBeHidden();

    await page.getByLabel('OCRを表示').check();
    await expect(rawLine).toBeVisible();

    await page.fill('#search-input', '神秘');
    await expect(page.locator('.item:visible').first()).toContainText('神秘');

    await page.fill('#search-input', '');
    await expect(page.locator('.item:visible')).toHaveCount(initialCount);

    await page.selectOption('#filter-color', 'red');
    await expect(page.locator('.item:visible')).toHaveCount(1);
    await expect(page.locator('.item:visible').first()).toContainText('神秘');

    await page.selectOption('#filter-color', 'blue');
    await expect(page.locator('.item:visible')).toHaveCount(1);
    await expect(page.locator('.item:visible').first()).toContainText('最大HP上昇');

    await page.selectOption('#filter-color', 'all');
    await expect(page.locator('.item:visible')).toHaveCount(initialCount);

    const firstImage = page.locator('.item-left img').first();
    await firstImage.click();
    await expect(page.locator('#lightbox')).toHaveAttribute('aria-hidden', 'false');

    const colorControl = page.locator('.item-color-select').first();
    await colorControl.selectOption('yellow');
    await expect(colorControl).toHaveValue('yellow');

    await expect(async () => {
      await colorControl.selectOption('');
    }).not.toThrow();

    const screenshotPath = path.resolve('test-results', `viewer-${Date.now()}.png`);
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });
    const stats = await fs.stat(screenshotPath);
    expect(stats.size).toBeGreaterThan(0);

    expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0);

    await page.locator('#lightbox-close').click();
    await expect(page.locator('#lightbox')).toHaveAttribute('aria-hidden', 'true');
  });
});
