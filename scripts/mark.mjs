/* ===========================================================================
   THE MARK — the SC monogram, CONSTRUCTED

   SUPERSEDED. The site now uses Priscilla's drawing itself: brand/
   mark-lockup.png, cropped and resized by scripts/build-icons.py and by
   nothing else. This file is what stood in between the decision to use a
   monogram and the arrival of the artwork, and it is kept for one reason —
   docs/report/figures.py draws a figure from it, so the report can show what
   the reconstruction settled (report, "What was built before the artwork
   arrived"). A check asserts that nothing the SITE builds imports it.

   What it settled, and what survived into the artwork's own assessment:
     * the proportion. Built at the sheet's literal 1 : 1.618 the S falls to
       about the C's x-height and the mark reads "sC". Measured off the
       drawing, Priscilla's own S is nearer 1 : 1.3 of her C — the stated
       ratio and the drawn ratio are not the same number, and the drawn one
       is the one that reads.
     * the size rule. Hatching has to come off below about 96px, because
       below that it fills in. A construction can obey that by not drawing
       it; the artwork cannot, because the hatching is in the pixels.

   Everything below this line is the construction as it was.
   ---------------------------------------------------------------------------

   Adopted 18 September 2026 from Priscilla's own prototype sheet, which
   settles a question the first mark could only work around.

   THE PROBLEM THE OLD MARK SOLVED, AND WHY IT NO LONGER HAS TO
   The wordmark translates: "Senso Comune Gallery" in English, 常识画廊 in
   Chinese. The first mark therefore carried no letterforms at all — a work
   on a wall — on the argument that "SC" means nothing beside 常识画廊.
   Finding C-04 has since been closed by decision: Priscilla keeps 常识画廊
   as the Chinese name because it reads as native, and that is worth more
   than one lockup in two languages. A MONOGRAM is not a translation of a
   name; it is a device that stands beside one. The mark can be Latin while
   the name stays Chinese, which is what most international houses do.

   WHAT THE SHEET SPECIFIES, AND WHAT IS ADOPTED
     interlocking S and C, S : C = 1 : 1.618        adopted, exactly
     Fibonacci / golden-rectangle construction      adopted as the layout
     diagonal hatching, upper-left to lower-right   adopted — and it is the
       same direction and angle as the Leonardo hatch already running across
       the Tribute ground (base.css, .hatch)
     sage green   #969B7D                           already --field
     deep green   #737C61                           already --field-deep
     warm ivory   #E9E2D3                           NOT added: it is within
       one step of the mat cream, and a fifth cream is a fifth cream
     charcoal     #24241F                           NOT adopted. The site's
       ink and bar are #3A2B22, a warm brown the whole palette is solved
       against; a cool near-black beside sage reads as a second, colder
       identity. The sheet's "black" variation is drawn in --bar instead.

   TWO DECISIONS MADE HERE, NOT ON THE SHEET
   1. THE LETTERS ARE FRAUNCES. There is no vector source for the drawing on
      the sheet, and a trace from a screenshot would be a worse object than a
      construction. Fraunces is the face the wordmark is already set in, at
      the display end of its optical-size axis, where it draws the heavy
      stems and hairlines the prototype is built from — so the lockup is one
      typeface rather than two. Outlines are cut from the font by
      scripts/build-mark-paths.py; scripts/mark-paths.js is its output.
   2. THE HATCHING COMES OFF BELOW ~96px. The sheet's own minimum is 15mm in
      print. At a 16px favicon the hatch fills in and the hairlines vanish,
      so the small rendering is plain — which is the one rule the four
      variations on the sheet do not state and the one that decides whether
      a mark survives the surface it is seen on most.

   Consumed by:
     docs/report/figures.py   mark_construction(), and nothing else
   =========================================================================== */

import { GLYPHS } from './mark-paths.js';

export const MARK = {
  box: 64,
  /** The sheet gives the letter proportion as S : C = 1 : 1.618, and that is
      the one number here that is NOT taken literally. Drawn at 1 : phi in a
      square field, Fraunces' S falls to about the C's x-height and stops
      reading as a capital at all — it reads as "sC" — and the C's lower arm
      cannot reach far enough left to close the hole the small S leaves at the
      bottom of the square. The built mark uses 1 : sqrt(phi) = 1 : 1.272,
      which is the same construction one step in: the golden section of the
      golden section, and the ratio of a golden rectangle's side to the square
      on its own diagonal. It fills the square, and the S is still visibly the
      smaller letter, which is what the sheet's four variations show. */
  phi: 1.618,
  ratio: Math.sqrt(1.618),
  /** The margin around the pair, in box units. */
  pad: 6,
  /** How much of the S's width lies over the C. The two letters are pushed
      together by this much and the pair is then sized to fill the field, so
      the interlock is the input and the cap heights fall out of it. */
  overlapFrac: 0.45,
  /** The gap that lets the C read as passing behind the S, in box units. */
  inlay: 1.7,
  /** Hatching: Leonardo's direction and the site's own angle and pitch. */
  hatchAngle: 45,
  hatchPitch: 2.2,
  hatchWidth: 0.55,
  ground: '#3A2B22',   /* --bar        */
  paper:  '#F3EBDD',   /* --paper      */
  sage:   '#969B7D',   /* --field      */
  sageDeep: '#737C61', /* --field-deep */
};

const f = (n) => (+n.toFixed(3)).toString();

/**
 * Where the two letters sit. One place computes it, so no consumer — the
 * icons, the templates, the report figure, the checks — can drift from it.
 */
export function markGeometry(m = MARK) {
  const box = { S: GLYPHS.glyphs.S.bbox, C: GLYPHS.glyphs.C.bbox };
  const size = (b) => ({ w: b[2] - b[0], h: b[3] - b[1] });
  const sC = size(box.C), sS = size(box.S);

  // The C is set against the lower right of the field, the S against the
  // upper left, overlapping by overlapFrac of the S's width. Solve the C's
  // cap height so the pair exactly fills the field between the margins:
  //   field = wS + wC - overlap = hC * (aC + (1 - f) * aS / phi)
  const aC = sC.w / sC.h, aS = sS.w / sS.h;
  const field = m.box - 2 * m.pad;
  const hC = field / (aC + (1 - m.overlapFrac) * aS / m.ratio);
  const hS = hC / m.ratio;
  const wC = aC * hC;
  const wS = aS * hS;

  const left = m.pad;
  const right = m.box - m.pad;
  const top = m.pad;
  const bottom = m.box - m.pad;
  return {
    hC, hS, wC, wS,
    C: { x: right - wC, y: bottom - hC },
    S: { x: left, y: top },
    /** How much of the S's width lies over the C. */
    overlap: (left + wS) - (right - wC),
    /** Scale and offset that map font units to that placement. */
    place: (ch, at, h) => {
      const b = GLYPHS.glyphs[ch].bbox;
      const k = h / (b[3] - b[1]);
      // y runs UP in the font and DOWN in the SVG.
      return `translate(${f(at.x - b[0] * k)} ${f(at.y + b[3] * k)}) scale(${f(k)} ${f(-k)})`;
    },
  };
}

/**
 * One geometry, four renderings — the sheet's own variation set.
 *
 *   reversed   cream letters on the brown bar. The masthead and every icon:
 *              the bar is the most legible surface on the site (11.45:1).
 *   primary    sage letters on the cream sheet. 4.70:1 — a graphic needs
 *              3:1, so this is the one that may not carry a hairline it
 *              depends on, which is why the inlay is a gap and not a stroke.
 *   black      --bar letters on cream. 11.45:1. Print, and one-colour use.
 *   mono       currentColor. Inherits whatever it is set in.
 *
 * @param {object} opts
 * @param {'reversed'|'primary'|'black'|'mono'} opts.variant
 * @param {boolean} opts.hatch   draw the diagonal hatching. Off by default:
 *                               below ~96px it fills in and reads as mud.
 * @param {boolean} opts.tokens  colour through CSS custom properties rather
 *                               than literals — only safe inline in the page
 * @param {string}  opts.label   accessible name; omit for a decorative mark
 */
export function markSvg({ variant = 'reversed', hatch = false, tokens = false,
                          label = '', className = '', id = 'sc', ink = null } = {}) {
  const m = MARK;
  const g = markGeometry(m);
  const T = (lit, token) => (tokens ? `var(${token})` : lit);

  const skin = {
    reversed: { field: T(m.ground, '--bar'),   ink: T(m.paper, '--paper'),    shade: T(m.sageDeep, '--field-deep') },
    primary:  { field: 'none',                 ink: T(m.sage, '--field'),     shade: T(m.sageDeep, '--field-deep') },
    black:    { field: 'none',                 ink: T(m.ground, '--bar'),     shade: T(m.sageDeep, '--field-deep') },
    mono:     { field: 'none',                 ink: 'currentColor',           shade: 'currentColor' },
  }[variant];
  // `ink` names the colour outright, for a renderer with no cascade to
  // inherit currentColor from — the report's PDF, chiefly.
  if (ink) { skin.ink = ink; if (skin.shade === 'currentColor') skin.shade = ink; }

  // The inlay: the S is stamped once in the ground colour, fattened by a
  // stroke, before it is drawn again in the ink. That gap is what makes the C
  // pass BEHIND the S rather than merge with it. On a transparent ground
  // there is nothing to stamp with, so the gap is cut with a mask instead.
  const onField = skin.field !== 'none';
  const letter = (ch, at, h) =>
    `<path d="${GLYPHS.glyphs[ch].d}" transform="${g.place(ch, at, h)}"/>`;

  const hatchDefs = hatch ? `<pattern id="${id}-hatch" patternUnits="userSpaceOnUse" `
    + `width="${f(m.hatchPitch)}" height="${f(m.hatchPitch)}" `
    + `patternTransform="rotate(${m.hatchAngle})">`
    + `<line x1="0" y1="0" x2="0" y2="${f(m.hatchPitch)}" stroke="${skin.shade}" `
    + `stroke-width="${f(m.hatchWidth)}"/></pattern>` : '';

  const maskDefs = onField ? '' : `<mask id="${id}-inlay">`
    + `<rect width="${m.box}" height="${m.box}" fill="#fff"/>`
    + `<g fill="none" stroke="#000" stroke-width="${f(m.inlay * 2)}">${letter('S', g.S, g.hS)}</g>`
    + `</mask>`;

  const defs = (hatchDefs || maskDefs) ? `<defs>${hatchDefs}${maskDefs}</defs>` : '';

  const cGroup = onField
    ? `<g fill="${skin.ink}">${letter('C', g.C, g.hC)}</g>`
      + `<g fill="none" stroke="${skin.field}" stroke-width="${f(m.inlay * 2)}">${letter('S', g.S, g.hS)}</g>`
    : `<g fill="${skin.ink}" mask="url(#${id}-inlay)">${letter('C', g.C, g.hC)}</g>`;

  const a = label ? ` role="img" aria-label="${label}"`
                  : ' aria-hidden="true" focusable="false"';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.box} ${m.box}"`
      + `${className ? ` class="${className}"` : ''}${a}>`,
    label ? `<title>${label}</title>` : '',
    defs,
    onField ? `<rect width="${m.box}" height="${m.box}" fill="${skin.field}"/>` : '',
    cGroup,
    `<g fill="${skin.ink}">${letter('S', g.S, g.hS)}</g>`,
    hatch ? `<g fill="url(#${id}-hatch)">${letter('C', g.C, g.hC)}${letter('S', g.S, g.hS)}</g>` : '',
    '</svg>',
  ].filter(Boolean).join('\n  ').replace('\n  </svg>', '\n</svg>');
}
