let test, expect, AxeBuilder;
try {
  ({ test, expect } = await import('@playwright/test'));
  ({ default: AxeBuilder } = await import('@axe-core/playwright'));
} catch (_) {
  const nodeTest = await import('node:test');
  test = nodeTest.test;
  test('WCAG 2.1 AA browser audit is skipped when optional browser dependencies are unavailable', { skip: 'Install pinned devDependencies and Playwright browsers to run the live accessibility audit.' }, () => {});
}

if (AxeBuilder) {
  const pages = ['index.html','feed.html','friends.html','messages.html','message.html','notifications.html','profile.html','rooms.html','room.html','room_chat.html','chat_room.html','settings.html','help.html','spike_predictor.html','admin.html'];
  for (const path of pages) {
    test(`WCAG 2.1 AA baseline: ${path}`, async ({ page }) => {
      await page.goto(`/${path}`, { waitUntil: 'domcontentloaded' });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      const serious = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
}
