/* ===========================================================================
   THE MARK — one geometry, four renderings

   The site had a wordmark and no mark. The wordmark translates (it is
   "Senso Comune Gallery" in English and 常识画廊 in Chinese), so an
   initials monogram can only ever serve one of the two locales: "SC" means
   nothing beside 常识画廊. A mark that carries no letterforms serves both,
   and is the only kind that can sit in a browser tab, a WeChat share card
   and a report footer without being redrawn per language.

   What it draws is the site's own structure: a work on a wall.

     ground   --bar     the dark brown masthead. The wall.
     plate    --paper   the cream sheet every work is mounted on. 3:4 —
                        the modal ratio of the catalogue, all of which is
                        portrait.
     datum    --field   the sage, running the full width behind the plate,
                        at 144.78 / 244 of the height: the museum hanging
                        standard, the same figure the scale diagram on every
                        work page is drawn to.

   The datum is sage, not sanguine, for two reasons. Sanguine on the bar is
   2.03:1 and would disappear at tab size; sage is 4.70:1. And the accent is
   spent on calls to action and nowhere else — that discipline is most of
   what this palette is for.

   Consumed by:
     scripts/build-icons.sh   icon.svg, favicon.ico, apple-touch-icon.png
     src/templates.js         the masthead lockup, inline and ground-less
     docs/report/preamble.tex \scmark, redrawn in TikZ (numbers below)
     docs/report/figures.py   the logo-options plate
   =========================================================================== */

export const MARK = {
  box: 64,
  /** 144.78 cm centre height on a 244 cm wall — the museum hanging standard. */
  hang: 144.78 / 244,
  /** Plate width in box units, and its aspect. Every work in the catalogue is
      portrait; 3:4 is the modal ratio (four of six). */
  plateW: 28,
  plateRatio: 3 / 4,
  datumWidth: 2,
  /** Stroke of the wall in the outline (knockout) rendering. */
  outlineWidth: 1.5,
  ground: '#3A2B22',   /* --bar     */
  plate:  '#F3EBDD',   /* --paper   */
  datum:  '#969B7D',   /* --field   */
};

/** The four derived numbers, so no consumer recomputes them. */
export function markGeometry(m = MARK) {
  const plateH = m.plateW / m.plateRatio;
  const cy = m.box * (1 - m.hang);        // datum height, measured down
  return {
    plateH,
    cy,
    x: (m.box - m.plateW) / 2,
    y: cy - plateH / 2,
  };
}

const f = (n) => (+n.toFixed(3)).toString();

/**
 * Two renderings of one geometry. The wall is a FILL where it can be seen, and
 * an OUTLINE where the ground is already the wall — on the masthead, where the
 * bar is the same colour the fill would be, a filled wall is no wall at all.
 *
 * @param {object} opts
 * @param {'fill'|'outline'} opts.wall  how to draw the wall
 * @param {boolean} opts.tokens  colour through CSS custom properties rather
 *                               than literals — only safe inline in the page
 * @param {string}  opts.label   accessible name; omit for a decorative mark
 */
export function markSvg({ wall = 'fill', tokens = false, label = '', className = '' } = {}) {
  const m = MARK;
  const g = markGeometry(m);
  const c = tokens
    ? { ground: 'var(--bar)', plate: 'var(--paper)', datum: 'var(--field)' }
    : { ground: m.ground, plate: m.plate, datum: m.datum };

  const a = label
    ? ` role="img" aria-label="${label}"`
    : ' aria-hidden="true" focusable="false"';

  const k = m.outlineWidth;
  const wallShape = wall === 'outline'
    ? `<rect x="${k / 2}" y="${k / 2}" width="${m.box - k}" height="${m.box - k}" `
      + `fill="none" stroke="${c.datum}" stroke-width="${k}"/>`
    : `<rect width="${m.box}" height="${m.box}" fill="${c.ground}"/>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.box} ${m.box}"`
      + `${className ? ` class="${className}"` : ''}${a}>`,
    label ? `<title>${label}</title>` : '',
    wallShape,
    `<line x1="0" y1="${f(g.cy)}" x2="${m.box}" y2="${f(g.cy)}" `
      + `stroke="${c.datum}" stroke-width="${m.datumWidth}"/>`,
    `<rect x="${f(g.x)}" y="${f(g.y)}" width="${f(m.plateW)}" height="${f(g.plateH)}" `
      + `fill="${c.plate}"/>`,
    '</svg>',
  ].filter(Boolean).join('\n  ').replace('\n  </svg>', '\n</svg>');
}
