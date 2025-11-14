import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';

test.describe('Relic viewer', () => {
  test('index にビューワへのリンクが表示される', async ({ page }) => {
    await page.goto('/');
    const viewerLink = page.getByRole('link', { name: /sample/ });
    await expect(viewerLink).toBeVisible();
    await viewerLink.click();
    await expect(page).toHaveURL(/sample\/gallery\/index\.html$/);
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

    await page.goto('/sample/gallery/index.html');
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

    await page.goto('/sample/gallery/index.html');

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

  test('補助列なしでも効果編集が保存される', async ({ page }) => {
    const savePayloads: Array<{ records?: Array<Record<string, unknown>> }> = [];

    await page.route('**/__viewer_api__/save', async (route) => {
      const request = route.request();
      const bodyText = request.postData() ?? '';
      if (bodyText) {
        try {
          const parsed = JSON.parse(bodyText) as { records?: Array<Record<string, unknown>> };
          savePayloads.push(parsed);
        } catch (error) {
          savePayloads.push({ records: [] });
          console.warn('保存リクエストの解析に失敗しました', error);
        }
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' })
      });
    });

    await page.goto('/sample/gallery/index.html');

    const firstEffect = page.locator('.effect[data-kind="effect"][data-slot="1"]').first();
    await expect(firstEffect).toBeVisible();

    const correctionInput = firstEffect.locator('.correction-input');
    await expect(correctionInput).toBeEditable();
    await correctionInput.fill('手動編集テスト');

    const saveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('__viewer_api__/save') && response.request().method() === 'POST'
    );

    await correctionInput.evaluate((element) => {
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await saveResponsePromise;

    expect(savePayloads.length).toBeGreaterThan(0);
    const payload = savePayloads[savePayloads.length - 1];
    expect(Array.isArray(payload.records)).toBe(true);

    const updatedRecord = payload.records?.find(
      (record) => typeof record.Image === 'string' && record.Image.includes('sample_red.png')
    );
    expect(updatedRecord).toBeTruthy();
    expect(updatedRecord?.Effect1).toBe('手動編集テスト');
    expect(updatedRecord?.Effect1Status).toBe('corrected');

    for (const record of payload.records ?? []) {
      const keys = Object.keys(record);
      for (const key of keys) {
        expect(key.includes('Correction')).toBeFalsy();
        expect(key.includes('LevelSuppressed')).toBeFalsy();
      }
    }
  });

  test('静的アセットが 404 を返さない', async ({ page }) => {
    const assetStatuses = new Map<string, number>();

    page.on('response', (response) => {
      try {
        const url = new URL(response.url());
        if (!url.pathname.match(/\.(css|js)$/)) {
          return;
        }
        assetStatuses.set(url.pathname, response.status());
      } catch (error) {
        // テストの安定性を優先し、URL 解析に失敗した場合は無視する
      }
    });

    await page.goto('/sample/gallery/index.html');
    await page.waitForLoadState('networkidle');

    const failures = [...assetStatuses.entries()].filter(([, status]) => status >= 400);
    expect(failures).toHaveLength(0);
    expect(assetStatuses.size).toBeGreaterThan(0);
  });
});
