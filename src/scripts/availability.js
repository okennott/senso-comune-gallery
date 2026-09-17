/**
 * Client-side availability check.  ~40 lines, no dependencies.
 *
 * A one-of-a-kind painting must not be sellable twice, and no platform in this
 * price range gives an atomic guarantee. Stripe deactivates a payment link on
 * `checkout.session.completed` — completion, not session start — so two buyers
 * already in checkout are both in valid sessions.
 *
 * This is the layer that survives what the other layers do not: a stale CDN
 * page, a silently failed rebuild, or a bfcache restore. It is why the build
 * report rates it the highest value per hour in the whole back end.
 *
 * It degrades to doing nothing: if the fetch fails, the page keeps whatever
 * the build said, which is the same position as not having this file at all.
 */
(() => {
  'use strict';

  const swap = (slug, entry) => {
    const root = document.querySelector(`[data-work="${slug}"]`);
    if (!root || !entry || !entry.sold) return;
    if (root.dataset.sold === 'true') return;   // build already knew

    root.dataset.sold = 'true';

    // Replace the buy control with the same capture the sold template uses.
    const action = root.querySelector('.btn');
    if (action) {
      const a = document.createElement('a');
      a.className = 'link-quiet';
      a.href = action.dataset.enquireHref || action.href;
      a.textContent = root.dataset.soldLabel || 'Sold';
      action.replaceWith(a);
    }

    // Mark the price without hiding it — a visible sold price is social proof.
    const price = root.querySelector('.price');
    if (price && !price.classList.contains('price--sold')) {
      price.classList.add('price--sold');
      const struck = document.createElement('span');
      struck.className = 'price__struck';
      struck.textContent = price.textContent.trim();
      price.textContent = '';
      price.append(struck, document.createTextNode(root.dataset.soldWord || 'Sold'));
    }

    // Announce it: someone may be sitting on this page when it sells.
    const live = document.getElementById('availability-live');
    if (live) live.textContent = root.dataset.soldAnnounce || 'This work has just sold.';
  };

  // Derive the deployment base from this script's own URL, so the same file
  // works at a domain root and at a GitHub Pages project subpath.
  const base = (document.currentScript || document.querySelector('script[src$="availability.js"]'))
    ?.getAttribute('src')?.replace(/availability\.js$/, '') || '/';

  const check = () => {
    // cache:'no-store' plus a short max-age on the file itself — this endpoint
    // is deliberately the one uncached thing on the site.
    fetch(base + 'availability.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) Object.keys(data).forEach((s) => swap(s, data[s])); })
      .catch(() => { /* offline or blocked: leave the page as built */ });
  };

  check();
  // bfcache restores serve the old DOM; re-check on the way back.
  window.addEventListener('pageshow', (e) => { if (e.persisted) check(); });
})();
