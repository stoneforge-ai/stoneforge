/**
 * Plausible Analytics — Custom Event Tracking
 *
 * This script sets up custom event tracking for stoneforge.ai via Plausible Analytics.
 * The Plausible script tag (in BaseLayout.astro) uses the tagged-events + outbound-links
 * extensions, which handle:
 *   - CSS class-based event tracking (plausible-event-name=EventName)
 *   - Automatic outbound link tracking
 *
 * This file handles events that require JavaScript (scroll depth, link interception, page-load events).
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * CONVERSION GOALS — Configure these in the Plausible dashboard:
 *
 *   Primary conversions:
 *     • Install+Copy  — user copies the install/quick-start command
 *
 *   Secondary conversions:
 *     • Docs+Click    — user clicks a link to docs.stoneforge.ai
 *     • GitHub+Click  — user clicks the GitHub repo link
 *     • CTA+Click     — user clicks a CTA button (Get Started, Try Stoneforge, etc.)
 *
 *   Engagement events (not conversions, but useful for analysis):
 *     • Comparison+View  — user views a /compare/* page
 *     • Use+Case+View   — user views a /use-cases/* page
 *     • Blog+Read        — user scrolls past 75% of a blog post
 *
 *   Automatic (handled by Plausible outbound-links extension):
 *     • Outbound Link    — clicks on external links (automatic)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

// Extend Window to include Plausible's global function
declare global {
  interface Window {
    plausible: ((
      eventName: string,
      options?: { props?: Record<string, string>; callback?: () => void }
    ) => void) & { q?: any[][] };
  }
}

// Initialize Plausible queue pattern immediately.
// This buffers events until the real Plausible script loads (which uses defer).
// When Plausible loads, it processes the queue. No events are lost regardless of load order.
// If Plausible is blocked (e.g. by an ad-blocker), events are silently queued and discarded.
window.plausible =
  window.plausible ||
  function (...args: any[]) {
    (window.plausible.q = window.plausible.q || []).push(args);
  };

/**
 * Track a custom event via Plausible.
 * Events are queued if the Plausible script hasn't loaded yet.
 */
function trackEvent(name: string, props?: Record<string, string>): void {
  window.plausible(name, props ? { props } : undefined);
}

/**
 * Track clicks on links pointing to docs.stoneforge.ai.
 */
function setupDocsClickTracking(): void {
  document.addEventListener('click', (e) => {
    const anchor = (e.target as Element)?.closest?.('a[href]');
    if (!anchor) return;

    const href = anchor.getAttribute('href') || '';
    if (href.includes('docs.stoneforge.ai')) {
      trackEvent('Docs+Click', { url: href });
    }
  });
}

/**
 * Track clicks on the GitHub repo link.
 */
function setupGitHubClickTracking(): void {
  document.addEventListener('click', (e) => {
    const anchor = (e.target as Element)?.closest?.('a[href]');
    if (!anchor) return;

    const href = anchor.getAttribute('href') || '';
    if (href.includes('github.com/stoneforge-ai')) {
      trackEvent('GitHub+Click', { url: href });
    }
  });
}

/**
 * Track clicks on CTA buttons.
 * Matches elements with data-cta attribute or common CTA text patterns.
 */
function setupCTAClickTracking(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as Element;
    const cta = target?.closest?.('[data-cta]') || target?.closest?.('a.cta, button.cta, .cta a, .cta button');

    if (cta) {
      const label = cta.textContent?.trim().slice(0, 50) || 'unknown';
      trackEvent('CTA+Click', { label });
      return;
    }

    // Also match common CTA link text
    const anchor = target?.closest?.('a[href]');
    if (anchor) {
      const text = anchor.textContent?.trim().toLowerCase() || '';
      const ctaPatterns = ['get started', 'try stoneforge', 'install', 'start building'];
      if (ctaPatterns.some((pattern) => text.includes(pattern))) {
        trackEvent('CTA+Click', { label: anchor.textContent?.trim().slice(0, 50) || 'unknown' });
      }
    }
  });
}

/**
 * Fire page-view events for comparison and use-case pages.
 */
function setupPageViewEvents(): void {
  const path = window.location.pathname;

  if (path.startsWith('/compare/') || path === '/compare') {
    trackEvent('Comparison+View', { path });
  }

  if (path.startsWith('/use-cases/') || path === '/use-cases') {
    trackEvent('Use+Case+View', { path });
  }
}

/**
 * Track when a user scrolls past 75% of a blog post.
 * Uses IntersectionObserver on a sentinel element placed near the bottom of the article.
 */
function setupBlogReadTracking(): void {
  const path = window.location.pathname;
  if (!path.startsWith('/blog/') || path === '/blog/' || path === '/blog') return;

  const article = document.querySelector('article .prose');
  if (!article) return;

  // Create a sentinel element at ~75% of the article
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.style.height = '1px';
  sentinel.style.width = '1px';
  sentinel.style.position = 'absolute';
  sentinel.style.pointerEvents = 'none';

  // Position it at 75% of the article content
  const articleEl = article as HTMLElement;
  articleEl.style.position = 'relative';
  sentinel.style.top = '75%';
  articleEl.appendChild(sentinel);

  let fired = false;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !fired) {
          fired = true;
          trackEvent('Blog+Read', { path, title: document.title });
          observer.disconnect();
        }
      }
    },
    { threshold: 0 }
  );

  observer.observe(sentinel);
}

/**
 * Track clicks on install/quick-start copy buttons.
 * The tagged-events extension handles this via CSS class `plausible-event-name=Install+Copy`
 * on copy buttons, but we also track it here for copy buttons that use the `.copy-btn` class.
 */
function setupInstallCopyTracking(): void {
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      trackEvent('Install+Copy');
    });
  });
}

// Initialize all tracking on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  setupInstallCopyTracking();
  setupDocsClickTracking();
  setupGitHubClickTracking();
  setupCTAClickTracking();
  setupPageViewEvents();
  setupBlogReadTracking();
});
