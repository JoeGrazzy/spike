import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
