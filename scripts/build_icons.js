// Generates the status bar icon font (21 ring, 21 pie and 21 bar glyphs, 5% steps) and
// registers the glyphs in package.json. Bump FONT_VERSION when glyphs change:
// VS Code caches fonts by file name.
const fs = require('node:fs');
const path = require('node:path');
const svg2ttf = require('svg2ttf');
const ttf2woff = require('ttf2woff');

const FONT_VERSION = 'v3';
const STEPS = 21;
const FIRST_CODEPOINT = 0xe000;
const CENTER = { x: 500, y: 380 };
const OUTLINE = { outer: 400, inner: 350 };
const FILL = { pie: [0, 290], ring: [200, 290] };
// The bar is a wide glyph: a rounded track (same 50-unit outline as the ring) with a solid
// fill inside, separated from it by a gap so 5% stays visible.
const BAR = { x: 100, width: 1800, top: 590, bottom: 170, outline: 50, gap: 60, advance: 2000 };
const DEFAULT_ADVANCE = 1000;

const point = (r, deg) => {
  const rad = (deg * Math.PI) / 180;
  return [CENTER.x + r * Math.sin(rad), CENTER.y + r * Math.cos(rad)];
};

// Points along an arc, clockwise (as seen on screen) when from < to.
const arc = (r, from, to) => {
  const count = Math.max(1, Math.ceil(Math.abs(to - from) / 3));
  return Array.from({ length: count + 1 }, (_, i) => point(r, from + ((to - from) * i) / count));
};

const toPath = (points) =>
  'M' + points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z';

// Opposite windings make the inner circle a hole under the non-zero fill rule.
const outline = () => toPath(arc(OUTLINE.outer, 0, 360)) + toPath(arc(OUTLINE.inner, 360, 0));

function fill(style, step) {
  if (step === 0) {
    return '';
  }
  const [inner, outer] = FILL[style];
  const end = (step / (STEPS - 1)) * 360;
  if (inner === 0) {
    return toPath([[CENTER.x, CENTER.y], ...arc(outer, 0, end)]);
  }
  return toPath([...arc(outer, 0, end), ...arc(inner, end, 0)]);
}

// Rounded rectangle, counter-clockwise (y points up) when `reverse` is false.
const roundedRect = (x0, y0, x1, y1, radius, reverse = false) => {
  const corners = [
    [x1 - radius, y0 + radius, -90],
    [x1 - radius, y1 - radius, 0],
    [x0 + radius, y1 - radius, 90],
    [x0 + radius, y0 + radius, 180],
  ];
  const points = corners.flatMap(([cx, cy, from]) =>
    Array.from({ length: 9 }, (_, i) => {
      const rad = ((from + i * 10) * Math.PI) / 180;
      return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
    }),
  );
  return toPath(reverse ? points.reverse() : points);
};

function bar(step) {
  const { x, width, top, bottom, outline: line, gap } = BAR;
  const inset = line + gap;
  const track = roundedRect(x, bottom, x + width, top, (top - bottom) / 2) +
    roundedRect(x + line, bottom + line, x + width - line, top - line, (top - bottom) / 2 - line, true);
  if (step === 0) {
    return track;
  }
  const height = top - bottom - 2 * inset;
  const fillWidth = ((width - 2 * inset) * step) / (STEPS - 1);
  return track + roundedRect(x + inset, bottom + inset, x + inset + fillWidth, top - inset, Math.min(height / 2, fillWidth / 2));
}

const glyphs = [];
for (const style of ['ring', 'pie']) {
  for (let step = 0; step < STEPS; step++) {
    const percent = String(step * 5).padStart(2, '0');
    glyphs.push({
      id: `claude-usage-${style}-${percent}`,
      codepoint: FIRST_CODEPOINT + glyphs.length,
      d: outline() + fill(style, step),
      advance: DEFAULT_ADVANCE,
    });
  }
}
for (let step = 0; step < STEPS; step++) {
  glyphs.push({
    id: `claude-usage-bar-${String(step * 5).padStart(2, '0')}`,
    codepoint: FIRST_CODEPOINT + glyphs.length,
    d: bar(step),
    advance: BAR.advance,
  });
}

const svg = `<?xml version="1.0" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg"><defs>
<font id="claude-usage" horiz-adv-x="1000">
<font-face font-family="claude-usage" units-per-em="1000" ascent="800" descent="-200"/>
<missing-glyph horiz-adv-x="1000"/>
${glyphs
  .map((g) => `<glyph glyph-name="${g.id}" unicode="&#x${g.codepoint.toString(16)};" horiz-adv-x="${g.advance}" d="${g.d}"/>`)
  .join('\n')}
</font></defs></svg>`;

const root = path.join(__dirname, '..');
const ttf = svg2ttf(svg, {}).buffer;
const woff = Buffer.from(ttf2woff(new Uint8Array(ttf)).buffer);
const fontPath = `./resources/claude-usage-icons-${FONT_VERSION}.woff`;
fs.mkdirSync(path.join(root, 'resources'), { recursive: true });
for (const old of fs.readdirSync(path.join(root, 'resources'))) {
  if (old.endsWith('.woff')) {
    fs.rmSync(path.join(root, 'resources', old));
  }
}
fs.writeFileSync(path.join(root, fontPath), woff);

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.contributes.icons = Object.fromEntries(
  glyphs.map((g) => [
    g.id,
    {
      description: `Usage indicator ${g.id.replace('claude-usage-', '')}%`,
      default: { fontPath, fontCharacter: `\\${g.codepoint.toString(16).toUpperCase()}` },
    },
  ]),
);
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Wrote ${fontPath} with ${glyphs.length} glyphs`);
