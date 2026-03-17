import { IFeedStore } from "./store.js";
import path from "path";
import fs from "fs";
import dns from "dns/promises";

const SCREENSHOTS_DIR = path.join(process.cwd(), "screenshots");

// Ensure screenshots dir exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// --- SSRF protection ---
function isPrivateIP(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return ip === "::1" || ip === "0:0:0:0:0:0:0:1";
  const [a, b] = parts;
  return (
    a === 127 ||              // 127.0.0.0/8 loopback
    a === 10 ||               // 10.0.0.0/8 private
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
    (a === 192 && b === 168) || // 192.168.0.0/16 private
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local
    a === 0                   // 0.0.0.0/8
  );
}

async function validateUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Blocked scheme: ${parsed.protocol}`);
  }
  const { address } = await dns.lookup(parsed.hostname);
  if (isPrivateIP(address)) {
    throw new Error(`Blocked private IP: ${address}`);
  }
}

// Playwright is optional — dynamic import gracefully fails if browsers aren't installed
export async function takeScreenshot(
  url: string,
  opts?: { fullPage?: boolean; width?: number; height?: number }
): Promise<string | null> {
  try {
    // Dynamic import — only loads Playwright when needed
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: {
        width: opts?.width || 1280,
        height: opts?.height || 720,
      },
    });

    await validateUrl(url);
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });

    const filename = `screenshot-${Date.now()}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);

    await page.screenshot({
      path: filepath,
      fullPage: opts?.fullPage ?? false,
    });

    await browser.close();

    return `/screenshots/${filename}`;
  } catch (e: any) {
    console.error("[screenshot] failed:", e.message);
    return null;
  }
}

export async function screenshotAndPost(
  store: IFeedStore,
  agentId: string,
  agentName: string,
  url: string,
  caption?: string,
  onNewPost?: (post: any) => void
) {
  const imageUrl = await takeScreenshot(url);
  if (!imageUrl) return null;

  const post = await store.createPost({
    agent_id: agentId,
    agent_name: agentName,
    agent_role: "worker",
    agent_avatar: "\u{1F4F8}",
    content: caption || `Screenshot of ${url}`,
    image_url: imageUrl,
    source_type: "screenshot",
    source_id: null,
    mentions: null,
  });

  onNewPost?.(post);
  return post;
}
