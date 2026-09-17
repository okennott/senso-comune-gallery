/**
 * Work-page gallery, enhanced. Everything works without this file: the views
 * are a scroll-snap strip that swipes natively, and each thumbnail is a plain
 * link to its view. This adds the three things a link cannot do:
 *
 *   - marks the thumbnail of the view in sight with aria-current, so a screen
 *     reader and the eye both know where they are;
 *   - moves the strip WITHOUT adding a history entry per thumbnail, so the
 *     back button leaves the page instead of stepping back through views;
 *   - arrow keys along the thumbnails, Home and End.
 *
 * A video scrolled out of sight is paused. Nothing plays on its own.
 * Honours reduced motion: the strip jumps rather than glides.
 */
(() => {
  'use strict';
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  for (const root of document.querySelectorAll('[data-gallery]')) {
    const strip = root.querySelector('.gallery__views');
    const views = [...strip.querySelectorAll('.gallery__view')];
    const thumbs = [...root.querySelectorAll('.gallery__thumb')];
    if (!views.length || views.length !== thumbs.length) continue;

    const mark = (i) => thumbs.forEach((t, k) => {
      if (k === i) t.setAttribute('aria-current', 'true');
      else t.removeAttribute('aria-current');
    });

    const show = (i) => {
      strip.scrollTo({ left: views[i].offsetLeft - strip.offsetLeft, behavior: still.matches ? 'auto' : 'smooth' });
      mark(i);
    };

    thumbs.forEach((t, i) => {
      t.addEventListener('click', (e) => { e.preventDefault(); show(i); });
      t.addEventListener('keydown', (e) => {
        const last = thumbs.length - 1;
        const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: last }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        const k = Math.max(0, Math.min(last, to));
        thumbs[k].focus();
        show(k);
      });
    });

    // Whichever view is mostly in the strip is the current one; a video that
    // leaves it stops.
    const seen = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const i = views.indexOf(en.target);
        if (en.isIntersecting) mark(i);
        else en.target.querySelector('video')?.pause();
      }
    }, { root: strip, threshold: 0.6 });
    views.forEach((v) => seen.observe(v));

    // Arriving with a view in the address bar (a shared link, or the
    // no-script jump) starts on that view.
    const hashed = views.findIndex((v) => `#${v.id}` === location.hash);
    mark(hashed >= 0 ? hashed : 0);
  }
})();
