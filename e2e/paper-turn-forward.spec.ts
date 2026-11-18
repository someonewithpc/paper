import { expect, test } from '@playwright/test';

import { dogEarShown, frontPageName, playgroundStack, swipeStack } from './support/paperStack.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('one flick turns the page away and the same flick brings it back', async ({ page }) => {
  const stack = playgroundStack(page);
  await stack.scrollIntoViewIfNeeded();
  await dogEarShown(stack);

  // A third of the stack's diagonal is about what a trackpad flick hands over, and both
  // directions commit on a quarter of it.
  await swipeStack(page, stack, true, 0.35);
  expect(await frontPageName(stack)).toBe('Plain · Contents');

  await swipeStack(page, stack, false, 0.35);
  expect(await frontPageName(stack)).toBe('Plain · Cover');
});
