import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface Checkpoint {
  id: string;
  image: string;
  assertion: string;
  timestamp: string;
  url: string;
}

interface Manifest {
  generated: string;
  checkpoints: Checkpoint[];
}

const CHECKPOINT_DIR = process.env.CHECKPOINT_DIR || './checkpoints';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadManifest(): Manifest {
  const manifestPath = path.join(CHECKPOINT_DIR, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  }
  return { generated: new Date().toISOString(), checkpoints: [] };
}

function saveManifest(manifest: Manifest): void {
  ensureDir(CHECKPOINT_DIR);
  const manifestPath = path.join(CHECKPOINT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

export interface CaptureOptions {
  fullPage?: boolean;
  selector?: string;
  mask?: string[];
}

export function initCheckpoints(testName: string) {
  const testDir = path.join(CHECKPOINT_DIR, testName);
  ensureDir(testDir);

  let counter = 0;

  return async function capture(
    page: Page,
    assertion: string,
    options?: CaptureOptions
  ): Promise<void> {
    counter++;
    const paddedIndex = String(counter).padStart(3, '0');
    const slug = slugify(assertion);
    const filename = `${paddedIndex}_${slug}.png`;
    const relativePath = `${testName}/${filename}`;
    const fullPath = path.join(CHECKPOINT_DIR, relativePath);

    // Mask dynamic elements if specified
    if (options?.mask) {
      for (const selector of options.mask) {
        await page
          .locator(selector)
          .evaluateAll((els) =>
            els.forEach((el) => ((el as HTMLElement).style.visibility = 'hidden'))
          )
          .catch(() => {});
      }
    }

    // Capture screenshot
    if (options?.selector) {
      await page.locator(options.selector).screenshot({ path: fullPath });
    } else {
      await page.screenshot({ path: fullPath, fullPage: options?.fullPage });
    }

    // Restore masked elements
    if (options?.mask) {
      for (const selector of options.mask) {
        await page
          .locator(selector)
          .evaluateAll((els) =>
            els.forEach((el) => ((el as HTMLElement).style.visibility = 'visible'))
          )
          .catch(() => {});
      }
    }

    // Update manifest
    const manifest = loadManifest();
    manifest.checkpoints.push({
      id: `${testName}/${paddedIndex}`,
      image: relativePath,
      assertion,
      timestamp: new Date().toISOString(),
      url: page.url(),
    });
    manifest.generated = new Date().toISOString();
    saveManifest(manifest);
  };
}

export function clearCheckpoints(): void {
  if (fs.existsSync(CHECKPOINT_DIR)) {
    fs.rmSync(CHECKPOINT_DIR, { recursive: true });
  }
}
