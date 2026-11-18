import type { Page } from '@playwright/test';

export interface PixelDiff {
  /** Pixels that changed inside the edges, left of `edgeX` and above `edgeY`. */
  inside: number;
  /** Each changed pixel past an edge, as `x,y` from the corner the edges meet at. */
  outside: string[];
}

/**
 * Compares two PNG screenshots of the same size pixel by pixel, decoded by the browser in a blank
 * tab of the same context so the page under test is left alone. A pixel counts as changed when a
 * channel moves by more than `tolerance`.
 */
export async function diffPngs(
  page: Page, a: Buffer, b: Buffer, edges: { x: number, y: number }, tolerance = 4,
): Promise<PixelDiff> {
  const tab = await page.context().newPage();
  try {
    return await tab.evaluate(async ({ a, b, edges, tolerance }) => {
      const decode = async (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [shown, hidden] = await Promise.all([decode(a), decode(b)]);
      const { width, height } = shown;
      const outside: string[] = [];
      let inside = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          let delta = 0;
          for (let c = 0; c < 3; c += 1) delta = Math.max(delta, Math.abs(shown.data[i + c]! - hidden.data[i + c]!));
          if (delta <= tolerance) continue;
          if (x >= edges.x || y >= edges.y) outside.push(`${x - edges.x},${y - edges.y}`);
          else inside += 1;
        }
      }
      return { inside, outside };
    }, { a: a.toString('base64'), b: b.toString('base64'), edges, tolerance });
  } finally {
    await tab.close();
  }
}
