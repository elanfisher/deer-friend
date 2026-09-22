// The whole deer: rig, animation, behaviour and rendering.
// Shared by the browser prototype (web/index.html), the Mac app (a WKWebView showing that page)
// and the Chrome extension (which injects this file straight into pages).
(() => {
'use strict';

// Desktop mode: hosted by the Mac app in a transparent, click-through strip above the Dock.
// Three hosts: the browser prototype (with its meadow and panel), the Mac app's transparent
// window, and the Chrome extension injecting her onto someone else's page.
const EXT = !!window.DEER_EXTENSION;
const DESK = EXT || !!window.DEER_DESKTOP || /[?&]desktop\b/.test(location.search);
if (DESK && !EXT) document.documentElement.classList.add('desktop');   // never restyle a page we're a guest on
else {
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
  document.head.appendChild(font);
}

// ─────────────────────────── utils ───────────────────────────
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const sign = v => (v < 0 ? -1 : 1);
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ─────────────────────────── palette ───────────────────────────
const COL = {
  coat: '#c47b3c',       // orange-red fawn coat
  coatDeep: '#9a5629',   // darker dorsal band / forehead
  coatMid: '#ad6832',    // soft shading between coat and coatDeep
  coatLight: '#dba06a',  // pale front of the neck
  coatDark: '#7c4524',   // far-side legs & ear
  cream: '#f4e6cf',      // belly, muzzle, throat, eye ring
  white: '#fffbf2',      // spots, tail flag
  earInner: '#f2dcc6',
  muzzle: '#8c5f43',
  tongue: '#ec8f9c',
  tongueDeep: '#c9606f',
  nose: '#231611',
  eye: '#1c120d',
  hoof: '#3a261a',
  outline: '#3b2317',
};
// Tongue pinks are kept out of the general palette: blended edge pixels (cream over brown)
// would otherwise snap to pink. They only match when the source pixel is genuinely pink.
const QUANT = Object.entries(COL).filter(([k]) => !k.startsWith('tongue')).map(([, v]) => hexRgb(v));
const QUANT_PINK = [hexRgb(COL.tongue), hexRgb(COL.tongueDeep)];
const OUTLINE_RGB = hexRgb(COL.outline);

// ─────────────────────────── deer sprite rig ───────────────────────────
// Everything below is authored facing RIGHT in a 96×72 canvas, y-down, ground at y=66.
// The rig is drawn with normal (antialiased) canvas shapes, then snapped to the palette,
// alpha-thresholded, and outlined — so the result is crisp pixel art.
const PAD = 18, DW = 96, DH = 72 + PAD, GROUND = 66 + PAD, ANCHOR_X = 40;   // rig is authored with ground at 66
const dc = document.createElement('canvas');
dc.width = DW; dc.height = DH;
const dg = dc.getContext('2d', { willReadFrequently: true });

function ell(g, x, y, rx, ry, rot, col) {
  g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill();
}
// Tapered limb segment with rounded joints.
function seg(g, ax, ay, bx, by, w1, w2, col) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(ax + px * w1 / 2, ay + py * w1 / 2);
  g.lineTo(bx + px * w2 / 2, by + py * w2 / 2);
  g.lineTo(bx - px * w2 / 2, by - py * w2 / 2);
  g.lineTo(ax - px * w1 / 2, ay - py * w1 / 2);
  g.closePath(); g.fill();
  g.beginPath(); g.arc(ax, ay, w1 / 2, 0, TAU); g.fill();
  g.beginPath(); g.arc(bx, by, w2 / 2, 0, TAU); g.fill();
}

// ─────────────────────────── body-part variants (Design Lab) ───────────────────────────
// Every body part has 10 numbered variants. SEL holds the chosen index (0-based) per part;
// C is the resolved config the rig reads from. Picks persist in localStorage.
const VARIANTS = {
  torso: [ // L length, D depth, arch of back, rump roundness/drop, chest depth, belly tuck
    { L: 30, D: 13,   arch: 1.0, rump: 0.8, chest: 0.5, tuck: 1.5 },
    { L: 32, D: 14,   arch: 1.2, rump: 0.9, chest: 1.0, tuck: 2.0 },
    { L: 34, D: 14,   arch: 1.0, rump: 1.0, chest: 1.0, tuck: 2.0 },
    { L: 34, D: 15,   arch: 1.8, rump: 1.0, chest: 1.5, tuck: 2.5 },
    { L: 36, D: 14,   arch: 1.2, rump: 1.0, chest: 1.0, tuck: 2.0 },
    { L: 36, D: 15.5, arch: 2.2, rump: 1.1, chest: 1.5, tuck: 3.0 },
    { L: 38, D: 15,   arch: 1.5, rump: 1.0, chest: 1.0, tuck: 2.5 },
    { L: 33, D: 16,   arch: 1.2, rump: 0.8, chest: 2.0, tuck: 3.0 },
    { L: 35, D: 13,   arch: 0.6, rump: 1.2, chest: 0.8, tuck: 1.5 },
    { L: 37, D: 16,   arch: 2.5, rump: 1.2, chest: 1.8, tuck: 3.2 },
  ],
  legs: [ // fu forearm, fl cannon (front); hind legs auto-fit to the ground; w thickness
    { fu: 11, fl: 10.5, w: 1.0 },  { fu: 12, fl: 11.5, w: 1.0 },  { fu: 12.5, fl: 12, w: 0.9 },
    { fu: 13, fl: 12.5, w: 1.0 },  { fu: 13.5, fl: 13, w: 0.85 }, { fu: 13, fl: 12.5, w: 1.2 },
    { fu: 14, fl: 13.5, w: 0.9 },  { fu: 12, fl: 11.5, w: 1.25 }, { fu: 14.5, fl: 14, w: 0.8 },
    { fu: 15, fl: 14.5, w: 0.9 },
  ],
  neck: [ // len, w0 base thickness, w1 top thickness
    { len: 11, w0: 6.5, w1: 4.2 }, { len: 12.5, w0: 7, w1: 4.4 }, { len: 14, w0: 7, w1: 4.2 },
    { len: 14, w0: 8, w1: 4.8 },   { len: 15, w0: 7.6, w1: 4.4 }, { len: 16, w0: 7, w1: 4 },
    { len: 16, w0: 8.5, w1: 5 },   { len: 17, w0: 7.5, w1: 4.2 }, { len: 13, w0: 9, w1: 5.2 },
    { len: 18, w0: 7, w1: 4 },
  ],
  head: [ // side view: s overall scale, mz muzzle length, cr cranium size
    { s: 0.70, mz: 1.0, cr: 1.0 },  { s: 0.75, mz: 1.0, cr: 1.0 },  { s: 0.78, mz: 1.1, cr: 0.95 },
    { s: 0.80, mz: 0.95, cr: 1.05 }, { s: 0.82, mz: 1.05, cr: 1.0 }, { s: 0.85, mz: 1.0, cr: 0.95 },
    { s: 0.85, mz: 1.15, cr: 1.0 }, { s: 0.88, mz: 0.95, cr: 1.1 }, { s: 0.90, mz: 1.05, cr: 1.0 },
    { s: 1.0, mz: 1.0, cr: 1.0 },
  ],
  face: [ // looking at the camera: s scale, len muzzle length, wid width, eyes spacing
    { s: 0.75, len: 1.0, wid: 1.0, eyes: 1.0 },  { s: 0.8, len: 1.1, wid: 0.95, eyes: 1.05 },
    { s: 0.85, len: 1.0, wid: 1.0, eyes: 1.0 },  { s: 0.85, len: 1.2, wid: 0.9, eyes: 1.1 },
    { s: 0.9, len: 1.1, wid: 1.0, eyes: 1.1 },   { s: 0.9, len: 0.95, wid: 1.1, eyes: 1.0 },
    { s: 0.95, len: 1.15, wid: 0.95, eyes: 1.15 }, { s: 1.0, len: 1.05, wid: 1.0, eyes: 1.1 },
    { s: 1.05, len: 1.2, wid: 0.9, eyes: 1.15 }, { s: 1.3, len: 1.0, wid: 1.0, eyes: 1.0 },
  ],
  ears: [ // len, w width, tip (lower = longer taper / pointier)
    { len: 8, w: 2.2, tip: 0.75 },   { len: 9, w: 2.4, tip: 0.75 },    { len: 10, w: 2.6, tip: 0.66 },
    { len: 10, w: 3.0, tip: 0.6 },  { len: 11, w: 2.6, tip: 0.6 },   { len: 11, w: 3.2, tip: 0.75 },
    { len: 11.8, w: 2.8, tip: 0.66 }, { len: 12, w: 2.4, tip: 0.5 }, { len: 12.5, w: 3.2, tip: 0.6 },
    { len: 13, w: 3.0, tip: 0.55 },
  ],
  tail: [ // len, w width, rest angle (bigger = hangs straighter down)
    { len: 6, w: 1.5, rest: 2.0 },   { len: 7.5, w: 1.7, rest: 2.0 },  { len: 8.5, w: 1.8, rest: 1.95 },
    { len: 9.5, w: 1.9, rest: 1.9 }, { len: 10.5, w: 1.9, rest: 1.95 }, { len: 10, w: 2.4, rest: 2.1 },
    { len: 11.5, w: 2.1, rest: 1.85 }, { len: 12, w: 1.8, rest: 2.05 }, { len: 9, w: 2.6, rest: 1.8 },
    { len: 13, w: 2.3, rest: 1.95 },
  ],
};
const PARTS = [
  ['torso', 'Body / torso', 'B'], ['legs', 'Legs', 'L'], ['neck', 'Neck', 'N'], ['head', 'Head (side)', 'H'],
  ['face', 'Face (looking at you)', 'F'], ['ears', 'Ears', 'E'], ['tail', 'Tail', 'T'],
];
const DEFAULT_SEL = { torso: 2, legs: 5, neck: 6, head: 5, face: 4, ears: 6, tail: 8 };   // B3 · L6 · N7 · H6 · F5 · E7 · T9
const SEL = { ...DEFAULT_SEL };
try {   // saved lab picks: take only the parts we know, and only valid variant numbers
  const saved = JSON.parse(localStorage.getItem('deerSel') || '{}');
  for (const [part] of PARTS) {
    const pick = Number(saved?.[part]);
    if (Number.isInteger(pick) && pick >= 0 && pick <= 9) SEL[part] = pick;
  }
} catch (e) { /* no saved picks, or storage unavailable */ }
let C;
function buildConfig() {
  C = {};
  for (const [k] of PARTS) C[k] = VARIANTS[k][clamp(SEL[k] | 0, 0, 9)];
  C.ver = (C.ver || 0) + 1 + Math.random();   // lets each deer know to re-lay her spots
  C.spots = [];
}
// Spots laid out to fit the current torso: two neat rows along the spine + sparse flank scatter.
function makeSpots(seed) {
  const T = C.torso, rearX = 41 - T.L / 2, frontX = 41 + T.L / 2, topY = 41 - T.D / 2;
  const r = mulberry32(seed), sp = [];
  for (let x = rearX + 3; x <= frontX - 6; x += 2.3) sp.push([x + r() * 0.5, topY + 1.3 + r() * 0.5]);
  for (let x = rearX + 4; x <= frontX - 8; x += 2.7) sp.push([x + r() * 0.8, topY + 3.7 + r() * 0.7]);
  const n = Math.round(T.L / 3);
  for (let i = 0; i < n; i++) sp.push([rearX + 4 + r() * (T.L - 13), topY + 5.5 + r() * (T.D * 0.62 - 5.5)]);
  return sp;
}
function saveSel() { try { localStorage.setItem('deerSel', JSON.stringify(SEL)); } catch (e) {} }
buildConfig();
const RIG = { nbx: 50.7, nby: 31 };   // neck base in rig coords (updated each standing draw)

// Front leg: forearm → knee (carpus) → cannon. Knee folds BACKWARD when the leg lifts.
function frontLeg(g, x, y, L, col) {
  const Lg = C.legs, w = Lg.w;
  const au = L.s + L.f * 0.35;
  const al = au - L.f * 1.75;
  const kx = x + Lg.fu * Math.sin(au), ky = y + Lg.fu * Math.cos(au);
  const hx = kx + Lg.fl * Math.sin(al), hy = ky + Lg.fl * Math.cos(al);
  seg(g, x, y, kx, ky, 3.2 * w, 1.9 * w, col);
  ell(g, kx, ky, 1.25 * w, 1.25 * w, 0, col);   // knobbly fawn knee
  seg(g, kx, ky, hx, hy, 1.7 * w, 1.5 * w, col);
  g.fillStyle = COL.hoof; g.fillRect(hx - 1.1, hy - 1.2, 2.3, 2.2);
}

// Hind leg: thigh goes down-FORWARD to the stifle, gaskin goes down-BACK to the hock,
// cannon drops to the hoof — the classic deer zig-zag. Flexing closes every joint.
// k scales the segments so the hoof lands on the ground for whatever torso is chosen.
const HIND_EXT = 11.3 * Math.cos(0.32) + 11 * Math.cos(0.5) + 10.4 * Math.cos(0.1);
function hindLeg(g, x, y, L, col, k) {
  const w = C.legs.w;
  const t1 = L.s + 0.32 + L.f * 0.55;
  const t2 = L.s - 0.5 - L.f * 0.6;
  const t3 = L.s + 0.1 + L.f * 1.05;
  const sx = x + 11.3 * k * Math.sin(t1), sy = y + 11.3 * k * Math.cos(t1);
  const kx = sx + 11 * k * Math.sin(t2), ky = sy + 11 * k * Math.cos(t2);
  const hx = kx + 10.4 * k * Math.sin(t3), hy = ky + 10.4 * k * Math.cos(t3);
  seg(g, x, y, sx, sy, 5.2 * w, 2.9 * w, col);   // skinny thigh
  seg(g, sx, sy, kx, ky, 2.7 * w, 1.8 * w, col); // gaskin
  ell(g, kx, ky, 1.15 * w, 1.15 * w, 0, col);    // bony hock
  seg(g, kx, ky, hx, hy, 1.7 * w, 1.5 * w, col); // cannon
  g.fillStyle = COL.hoof; g.fillRect(hx - 1.1, hy - 1.2, 2.3, 2.2);
}

// Tail: rests hanging down the rump with brown on top. raise=1 → straight UP, white flag.
function tail(g, x, y, raise, wag) {
  const Tl = C.tail;
  const a = lerp(Tl.rest, 4.71, raise) + wag * 0.45;   // 4.71 rad = pointing straight up
  const len = Tl.len * (1 + raise * 0.15), w = Tl.w + raise * 0.5;
  const shape = (l, ww, c) => {
    g.fillStyle = c; g.beginPath(); g.moveTo(0, -ww * 0.8);
    g.quadraticCurveTo(l * 0.45, -ww * 1.25, l, 0);
    g.quadraticCurveTo(l * 0.45, ww * 1.25, 0, ww * 0.8); g.closePath(); g.fill();
  };
  g.save(); g.translate(x, y); g.rotate(a);
  shape(len, w, COL.white);                          // white fringe / underside
  const br = 1 - raise * 0.9;                        // brown top shrinks away when flagged
  if (br > 0.05) { g.save(); g.translate(0, -w * 0.2 * br); shape(len * 0.92, w * 0.72 * br, COL.coat); g.restore(); }
  g.restore();
}

function ear(g, x, y, a, col, inner) {
  const E = C.ears;
  g.save(); g.translate(x, y); g.rotate(a);
  const leaf = (len, w, dx, c) => {
    g.fillStyle = c; g.beginPath(); g.moveTo(dx, -w * 0.38);            // narrow base
    g.bezierCurveTo(dx + len * 0.22, -w * 1.35, dx + len * E.tip, -w * 1.3, dx + len, 0);   // broad, then pointed tip
    g.bezierCurveTo(dx + len * E.tip, w * 1.15, dx + len * 0.22, w * 1.1, dx, w * 0.38);
    g.closePath(); g.fill();
  };
  leaf(E.len, E.w, 0, col);
  if (inner) leaf(E.len * 0.7, E.w * 0.6, E.len * 0.2, inner);
  g.restore();
}

// Head in its own frame: +x = direction the face points. Rotated to follow the neck.
function head(g, P) {
  const H = C.head, M = x => (x <= 3 ? x : 3 + (x - 3) * H.mz);   // stretch the muzzle only
  g.save(); g.scale(H.s, H.s);
  const eA = lerp(-2.75, -1.85, P.earPerk) + P.earFlick;
  ear(g, -0.6, -4.1, eA - 0.35 + P.earF, COL.coatDark, null);       // far ear
  ell(g, 1.2, 0, 5 * H.cr, 4.6 * H.cr, 0, COL.coat);                  // cranium
  g.fillStyle = COL.coat;                                             // long, tapered muzzle
  g.beginPath(); g.moveTo(2.5, -3.7); g.lineTo(M(12.6), -1.6);
  g.quadraticCurveTo(M(15.6), 0.2, M(12.8), 2.3); g.lineTo(3, 4.3); g.closePath(); g.fill();
  ell(g, 1.4, -2.5, 3.1, 1.3, 0.15, COL.coatDeep);                   // darker forehead
  ell(g, M(9), 3.0 + P.chew * 1.2, 4.4 * H.mz, 1.2, 0.1, COL.cream); // lower jaw (chews)
  ell(g, M(9.2), -1.1, 3.6 * H.mz, 1.0, 0.12, COL.muzzle);          // greyish bridge of the nose
  ell(g, M(12.4), 1.0, 1.5, 0.95, 0, COL.cream);                     // white muzzle
  if (P.tongue > 0.08) {                                              // blep!
    const k = P.tongue;
    ell(g, M(12.8) + k * 1.3, 2.3 + k * 0.9, 1.3 + k * 0.9, 1.05 + k * 0.25, 0.4, COL.tongue);
    if (k > 0.5) g.fillStyle = COL.tongueDeep, g.fillRect(M(13.1) + k * 1.2, 2.2 + k * 0.8, 1, 1);
  }
  ell(g, M(14.2), -0.1, 1.35, 1.25, 0, COL.nose);                     // nose
  ell(g, 3.6, -1.3, 2.8, 2.6, 0, COL.cream);                         // eye ring
  if (P.eye > 0.3) {
    ell(g, 3.6, -1.3, 2.1 + P.eyeWide * 0.3, Math.max(0.6, 2.15 * P.eye) + P.eyeWide * 0.3, 0, COL.eye);
    g.fillStyle = COL.white; g.fillRect(2.8, -2.7, 1.1, 1.1);             // eye shine
  } else {
    g.fillStyle = COL.eye; g.fillRect(2.2, -1.1, 2.9, 0.9);          // closed, sleepy line
  }
  ear(g, 0.8, -4.4, eA + P.earN, COL.coat, COL.earInner);           // near ear
  g.restore();
}

// Head turned to look straight at the viewer. Origin = top of the neck, y-down.
function headFront(g, P) {
  const F = C.face, W = F.wid, Y = y => (y <= 0.4 ? y : 0.4 + (y - 0.4) * F.len);
  g.save(); g.scale(F.s, F.s);
  const spread = lerp(1.3, 0.62, P.earPerk) + P.earFlick * 0.5;
  ear(g, -3.3 * W, -3.1, -Math.PI / 2 - spread + P.earF * 0.6, COL.coat, COL.earInner);
  ear(g, 3.3 * W, -3.1, -Math.PI / 2 + spread - P.earN * 0.6, COL.coat, COL.earInner);
  ell(g, 0, -0.4, 4.9 * W, 4.2, 0, COL.coat);                      // cranium
  g.fillStyle = COL.coat;                                            // muzzle coming toward us
  g.beginPath(); g.moveTo(-3.9 * W, 0.4); g.quadraticCurveTo(-3.2 * W, Y(6.6), 0, Y(7.8));
  g.quadraticCurveTo(3.2 * W, Y(6.6), 3.9 * W, 0.4); g.closePath(); g.fill();
  ell(g, 0, -2.6, 2.5 * W, 1.3, 0, COL.coatDeep);                   // forehead
  for (const x of [-2.9 * F.eyes, 2.9 * F.eyes]) {
    ell(g, x, -0.1, 2.2, 2.1, 0, COL.cream);                         // eye rings
    if (P.eye > 0.3) {
      ell(g, x, 0, 1.7 + P.eyeWide * 0.3, Math.max(0.6, 1.85 * P.eye) + P.eyeWide * 0.3, 0, COL.eye);
      g.fillStyle = COL.white; g.fillRect(x - 0.95, -1.2, 0.8, 0.8);
    } else { g.fillStyle = COL.eye; g.fillRect(x - 1.3, -0.2, 2.6, 0.8); }
  }
  ell(g, 0, Y(5.3), 2.3, 1.5, 0, COL.cream);                         // white muzzle
  ell(g, 0, Y(7.8), 1.2, 0.7, 0, COL.cream);                         // chin
  ell(g, 0, Y(3.9), 1.5, 0.4, 0, COL.cream);                         // pale band across the muzzle
  ell(g, 0, Y(5.6), 1.9, 1.3, 0, COL.nose);                          // big black nose
  if (P.tongue > 0.08) ell(g, 0.3, Y(7.4) + P.tongue * 0.8, 0.9 + P.tongue * 0.4, 0.7 + P.tongue * 0.7, 0, COL.tongue);
  g.restore();
}

// Neck with shading: darker mane line down the back, soft shadow, pale throat down the front.
function neck(g, bx, by, tx, ty, w0, w1) {
  const len = Math.hypot(tx - bx, ty - by) || 1, px = -(ty - by) / len, py = (tx - bx) / len;   // +p = throat side
  const band = (off, k, col, from = 0) => {
    const ax = lerp(bx, tx, from), ay = lerp(by, ty, from), wa = lerp(w0, w1, from);
    seg(g, ax + px * off * wa, ay + py * off * wa, tx + px * off * w1, ty + py * off * w1, wa * k, w1 * k, col);
  };
  seg(g, bx, by, tx, ty, w0, w1, COL.coat);
  band(-0.24, 0.46, COL.coatMid);              // shadowed back half
  band(-0.37, 0.2, COL.coatDeep, 0.1);         // mane line along the top
  band(0.3, 0.32, COL.coatLight, 0.05);        // pale front of the neck
  band(0.34, 0.2, COL.cream, 0.55);            // creamy throat up near the jaw
}

// Torso outline built from the chosen torso variant (body space, centred on 41,41).
function torsoGeom() {
  const T = C.torso;
  const rearX = 41 - T.L / 2, frontX = 41 + T.L / 2, topY = 41 - T.D / 2, botY = 41 + T.D / 2;
  return { T, rearX, frontX, topY, botY, tail: [rearX + 0.6, topY + 2 + 4.5 * T.rump] };
}
function bodyPath(g, G) {
  const { T, rearX, frontX, topY, botY } = G, [tx, ty] = G.tail;
  const q = (cx, cy, x, y) => g.quadraticCurveTo(cx, cy, x, y);
  g.beginPath();
  g.moveTo(tx, ty);                                                         // tail root
  q(rearX + 0.3, topY + 0.8 - T.arch * 0.2, rearX + 6, topY - T.arch * 0.35); // rump rounds down into the tail
  q(rearX + T.L * 0.36, topY - T.arch, 42, topY - T.arch * 0.6);           // arched loin
  q(frontX - 9, topY + 0.4, frontX - 5.5, topY + 0.7);                     // withers
  q(frontX + 0.2, topY + 0.9, frontX + 0.3, topY + T.D * 0.42);            // point of shoulder
  q(frontX + 0.6, botY + T.chest - 1.5, frontX - 6.5, botY + T.chest);     // chest
  q(frontX - 12, botY + T.chest + 0.6, 40, botY - T.tuck * 0.4);           // belly
  q(rearX + 11, botY - T.tuck * 1.1, rearX + 8, botY - T.tuck);            // flank
  q(rearX + 1.2, botY - T.tuck + 0.4, rearX - 0.4, topY + T.D * 0.62);     // back of the thigh
  q(rearX - 0.8, topY + T.D * 0.4, tx, ty);
  g.closePath();
}

function drawStanding(g, P) {
  const G = torsoGeom(), { T, rearX, frontX, topY, botY } = G, Lg = C.legs;
  const fNear = [frontX - 7, botY - 3.5], fFar = [frontX - 9, botY - 4.5];
  const hNear = [rearX + 7.5, topY + T.D * 0.5], hFar = [rearX + 5.5, topY + T.D * 0.45];
  // place the body so the front hooves touch the ground; hind legs are sized to match
  const dy0 = 64.8 - fNear[1] - (Lg.fu + Lg.fl) * 0.998;
  const kh = (64.8 - (hNear[1] + dy0)) / HIND_EXT;
  const dy = dy0 - P.bob + P.crouch * 4;
  const B = ([x, y]) => [x, y + dy];

  g.save();                                     // whole-body pitch (gallop rocking, leaps)
  g.translate(42, 46 + dy); g.rotate(P.pitch); g.translate(-42, -46 - dy);

  frontLeg(g, ...B(fFar), P.legs[0], COL.coatDark);   // far legs first
  hindLeg(g, ...B(hFar), P.legs[2], COL.coatDark, kh);
  if (P.tailRaise < 0.5) tail(g, ...B(G.tail), P.tailRaise, P.tailWag);   // hanging: tucked behind the rump

  g.save();
  g.translate(0, dy);
  bodyPath(g, G); g.fillStyle = COL.coat; g.fill(); g.clip();
  ell(g, 40, topY + 1, T.L * 0.5, 3.1, 0, COL.coatDeep);                    // dorsal band
  ell(g, frontX - 11, botY + T.chest - 0.3, T.L * 0.28, 2.4, 0, COL.cream); // belly
  ell(g, rearX + 0.2, topY + T.D * 0.58, 1.8, 4, 0, COL.cream);             // white rump
  g.fillStyle = COL.white;
  for (const [x, y] of C.spots) g.fillRect(x, y, 1.4, 1.4);
  g.restore();

  if (P.tailRaise >= 0.5) tail(g, ...B([G.tail[0] + 1, G.tail[1] - 1.5]), P.tailRaise, P.tailWag);   // raised: stands up off the rump
  hindLeg(g, ...B(hNear), P.legs[3], COL.coat, kh);   // near legs over body
  frontLeg(g, ...B(fNear), P.legs[1], COL.coat);

  // Neck + head. Head angle is derived from the neck angle so it always follows it.
  const [bx, by] = B([frontX - 4.5, topY + 2.2]), n = P.neck;
  RIG.nbx = bx; RIG.nby = by + P.bob - P.crouch * 4;
  let L = P.neckLen * C.neck.len / 15;
  if (n > 0.9) L = Math.max(L, (60.5 - by) / Math.sin(n));   // grazing: always reach the grass
  const ux = Math.cos(n), uy = Math.sin(n), px = -uy, py = ux;
  const tx = bx + ux * L, ty = by + uy * L;
  neck(g, bx, by, tx, ty, C.neck.w0, C.neck.w1);
  if (P.back) {
    g.save(); g.translate(tx - 0.5, ty); g.scale(-1, 1); g.rotate(P.lookAng + P.tilt * 0.3);
    head(g, P);
    g.restore();
  } else if (P.stare) {
    ell(g, tx + 0.3, ty + 2.2, 1.6, 1.4, 0, COL.cream);     // white throat patch, seen head-on
    g.save(); g.translate(tx + 0.8, ty - 2.5); g.rotate(P.tilt * 0.5); headFront(g, P); g.restore();
  } else {
    ell(g, tx - ux * 3.5 + px * 1.9, ty - uy * 3.5 + py * 1.9, 3.2, 1.1, n, COL.cream); // pale throat
    g.save(); g.translate(tx, ty); g.rotate(0.6 * n + 0.89 + P.tilt);
    head(g, P);
    g.restore();
  }
  g.restore();
}

// Curled-up sleeping fawn (legs tucked, head resting back on the body).
function drawCurled(g, P, t) {
  const b = Math.sin(t * 1.6) * 0.45;
  tail(g, 27, 56, 0, P.tailWag);
  g.save();
  g.beginPath(); g.moveTo(44 + 17, 57.5); g.ellipse(44, 57.5 - b * 0.4, 17, 8.5 + b * 0.5, 0, 0, TAU);
  g.fillStyle = COL.coat; g.fill(); g.clip();
  ell(g, 44, 50.8, 16, 3.8, 0, COL.coatDeep);
  ell(g, 46, 65.2, 14, 2.5, 0, COL.cream);
  g.fillStyle = COL.white;
  for (const [x, y] of C.spots) g.fillRect(x + 5, y + 15.5 - b * 0.4, 1.15, 1.15);
  g.restore();
  g.strokeStyle = COL.coatDeep; g.lineWidth = 1;
  g.beginPath(); g.ellipse(33, 58.5, 8, 6.3, 0, -2.3, 1.2); g.stroke();   // hind thigh edge
  seg(g, 34, 63.5, 46, 64.8, 2.6, 2, COL.coat);                          // tucked hind leg
  g.fillStyle = COL.hoof; g.fillRect(46, 63.7, 2.6, 2.2);
  seg(g, 55, 63, 63, 64.6, 2.6, 2, COL.coat);                            // folded front leg
  g.fillStyle = COL.hoof; g.fillRect(63, 63.5, 2.6, 2.2);
  const sleepy = { ...P, earPerk: 0, eye: 0, chew: 0, earFlick: 0, eyeWide: 0, tongue: 0 };
  if (P.awake) {
    // lying down but alert: neck up, head watching (follows the cursor like standing)
    const tx = 58.5, ty = 43 + b * 0.2;
    neck(g, 55, 54.5, tx, ty, 8, 5);
    if (P.back) {
      g.save(); g.translate(tx - 0.5, ty); g.scale(-1, 1); g.rotate(P.lookAng); head(g, P); g.restore();
    } else if (P.stare) {
      ell(g, tx + 0.3, ty + 2.4, 1.7, 1.5, 0, COL.cream);
      g.save(); g.translate(tx + 0.8, ty - 2.2); g.rotate(P.tilt * 0.5); headFront(g, P); g.restore();
    } else {
      const n = clamp(P.neck, -1.6, -0.6);
      g.save(); g.translate(tx, ty); g.rotate(0.6 * n + 0.89 + P.tilt); head(g, P); g.restore();
    }
  } else if (P.tuck) {
    // head swung back over the shoulder, nose tucked into her side by the hind leg
    seg(g, 57, 56, 54, 50.5 + b * 0.3, 7.5, 6, COL.coat);
    g.save(); g.translate(53, 50.8 + b * 0.3); g.scale(-1, 1); g.rotate(0.32);
    head(g, sleepy);
    g.restore();
  } else {
    // neck curving forward and chin resting on the ground, eyes closed, ears laid back
    seg(g, 55, 55, 61, 57.5 + b * 0.3, 7, 6, COL.coat);
    g.save(); g.translate(62, 57.5 + b * 0.3); g.rotate(0.28);
    head(g, sleepy);
    g.restore();
  }
}

// Snap to palette, threshold alpha, add a 1px dark outline → real pixel art.
const qCache = new Map();
function quantize(r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  let q = qCache.get(key);
  if (q) return q;
  let bd = 1e9;
  for (const c of QUANT) {
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < bd) { bd = d; q = c; }
  }
  for (const c of QUANT_PINK) {
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < 700 && d < bd) { bd = d; q = c; }
  }
  if (qCache.size < 50000) qCache.set(key, q);
  return q;
}
const mask = new Uint8Array(DW * DH);
function pixelize() {
  const img = dg.getImageData(0, 0, DW, DH), d = img.data;
  for (let i = 0; i < DW * DH; i++) {
    const o = i * 4;
    if (d[o + 3] >= 118) {
      const q = quantize(d[o], d[o + 1], d[o + 2]);
      d[o] = q[0]; d[o + 1] = q[1]; d[o + 2] = q[2]; d[o + 3] = 255; mask[i] = 1;
    } else { d[o + 3] = 0; mask[i] = 0; }
  }
  for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
    const i = y * DW + x;
    if (mask[i]) continue;
    if ((x > 0 && mask[i - 1]) || (x < DW - 1 && mask[i + 1]) || (y > 0 && mask[i - DW]) || (y < DH - 1 && mask[i + DW])) {
      const o = i * 4;
      d[o] = OUTLINE_RGB[0]; d[o + 1] = OUTLINE_RGB[1]; d[o + 2] = OUTLINE_RGB[2]; d[o + 3] = 255;
    }
  }
  dg.putImageData(img, 0, 0);
}

function renderDeer(P, t) {
  if (deer.spotsVer !== C.ver) { deer.spots = makeSpots(deer.seed); deer.spotsVer = C.ver; }
  C.spots = deer.spots;
  dg.clearRect(0, 0, DW, DH);
  dg.save(); dg.translate(0, PAD);
  if (P.lie >= 1) drawCurled(dg, P, t); else drawStanding(dg, P);
  dg.restore();
  pixelize();
}

// ─────────────────────────── world ───────────────────────────
const canvas = window.DEER_CANVAS || document.getElementById('world');
let wg = canvas.getContext('2d');
let SCALE = 4, W = 320, H = 180, HORIZON = 60;
const bg = document.createElement('canvas');
const DESK_CW = 220;   // desktop canvas width (logical px)
let tufts = [], flowers = [], clouds = [], butterflies = [];
const FLOWER_COLS = ['#f2c94c', '#e8833a', '#fbf8ef', '#b48ad6', '#f2c94c'];

function bounds() {
  if (DESK) return { x0: 30, x1: W - 30, y0: H - 7, y1: H - 4 };   // a thin ground line along the screen
  return { x0: 24, x1: W - 24, y0: HORIZON + 42, y1: H - 5 };
}

function buildBackground() {
  bg.width = W; bg.height = H;
  const g = bg.getContext('2d'), img = g.createImageData(W, H), d = img.data, r = mulberry32(42);
  const bayer = [0, 2, 3, 1];
  const sky = ['#9fd3e8', '#b3ddeb', '#c9e7e7', '#e1f0dc'].map(hexRgb);
  const meadow = ['#a3cc6d', '#93c262', '#84b858', '#76ad4f', '#69a247', '#5f9941'].map(hexRgb);
  const put = (x, y, c) => { const o = (y * W + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; };
  // tree lines
  const far = [], near = [];
  const ph = [r() * 10, r() * 10, r() * 10, r() * 10];
  for (let x = 0; x < W; x++) {
    far[x] = 14 + Math.sin(x * 0.045 + ph[0]) * 4 + Math.sin(x * 0.13 + ph[1]) * 2 + (r() < 0.3 ? 1 : 0);
    near[x] = 7 + Math.sin(x * 0.07 + ph[2]) * 3 + Math.sin(x * 0.21 + ph[3]) * 1.5 + (r() < 0.3 ? 1 : 0);
  }
  const farC = hexRgb('#7aa77a'), nearC = hexRgb('#5b8a55'), nearHi = hexRgb('#6b9a5f');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const th = bayer[(y % 2) * 2 + (x % 2)] / 4 - 0.375;
    if (y < HORIZON) {
      if (y >= HORIZON - near[x]) put(x, y, (y === Math.ceil(HORIZON - near[x]) || r() < 0.05) ? nearHi : nearC);
      else if (y >= HORIZON - far[x]) put(x, y, farC);
      else put(x, y, sky[clamp(Math.floor((y / HORIZON) * sky.length + th), 0, sky.length - 1)]);
    } else {
      const t = (y - HORIZON) / (H - HORIZON);
      let c = meadow[clamp(Math.floor(t * meadow.length + th), 0, meadow.length - 1)];
      const n = r();
      if (n < 0.035) c = c.map(v => v - 16); else if (n < 0.05) c = c.map(v => v + 12);
      put(x, y, c);
    }
  }
  g.putImageData(img, 0, 0);
}

function buildProps() {
  if (DESK) { tufts = []; flowers = []; clouds = []; butterflies = []; return; }
  const r = mulberry32(99), b = bounds();
  tufts = [];
  const nT = Math.floor((W * (H - HORIZON)) / 650);
  for (let i = 0; i < nT; i++) {
    tufts.push({ x: Math.floor(r() * W), y: Math.floor(HORIZON + 4 + r() * (H - HORIZON - 2)), h: 2 + Math.floor(r() * 3),
      c: ['#5d9a42', '#4c8a38', '#8cc063', '#6aa84a'][Math.floor(r() * 4)], p: r() * TAU });
  }
  flowers = [];
  const nF = Math.max(8, Math.floor(W / 28));
  for (let i = 0; i < nF; i++) {
    flowers.push({ x: Math.floor(b.x0 + 10 + r() * (b.x1 - b.x0 - 20)), y: Math.floor(b.y0 + r() * (b.y1 - b.y0)),
      c: FLOWER_COLS[Math.floor(r() * FLOWER_COLS.length)], eaten: false, regrow: 0 });
  }
  clouds = [];
  for (let i = 0; i < 4; i++) clouds.push({ x: r() * W, y: 6 + r() * (HORIZON * 0.5), w: 14 + Math.floor(r() * 18), v: 1.5 + r() * 2 });
  butterflies = [];
  for (let i = 0; i < 2; i++) butterflies.push({ x: rand(b.x0, b.x1), y: rand(b.y0, b.y1), vx: rand(-10, 10), vy: rand(-5, 5),
    t: rand(0, 10), alt: 14, c: i ? '#fbf8ef' : '#f0a23b' });
}

function resize() {
  if (!innerWidth || !innerHeight) return;   // not laid out yet — a resize event will follow
  const h = innerHeight;
  SCALE = DESK ? (window.DEER_SCALE || 1) : h < 520 ? 2 : h < 820 ? 3 : 4;
  W = Math.ceil(innerWidth / SCALE); H = Math.ceil(innerHeight / SCALE);
  HORIZON = DESK ? 0 : Math.round(H * 0.34);
  // desktop: each deer gets a small canvas that slides along with her, so only tiny textures repaint
  for (const cv of [canvas, ...herd.slice(1).map(d => d.cv)]) sizeCanvas(cv);
  for (const d of herd) d.ox = null;
  if (!DESK) buildBackground();
  buildProps();
  const b = bounds();
  for (const d of herd) {
    if (!d.x) { d.x = W * 0.55; d.y = (b.y0 + b.y1) / 2; }
    d.x = clamp(d.x, b.x0, b.x1); d.y = clamp(d.y, b.y0, b.y1);
    if (d.target) { d.target.x = clamp(d.target.x, b.x0, b.x1); d.target.y = clamp(d.target.y, b.y0, b.y1); }
  }
}
function sizeCanvas(cv) {
  if (EXT) {   // injected pages have no stylesheet of ours
    cv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;image-rendering:pixelated';
  }
  const CW = DESK ? Math.min(DESK_CW, W) : W;
  cv.width = CW; cv.height = H;
  cv.style.width = CW * SCALE + 'px'; cv.style.height = H * SCALE + 'px';
  cv.getContext('2d').imageSmoothingEnabled = false;
}

// ─────────────────────────── input ───────────────────────────
const mouse = { x: -999, y: -999, cx: 0, cy: 0, lcx: 0, lcy: 0, speed: 0, inside: false, down: false };
const keys = {};
canvas.addEventListener('mousemove', e => { mouse.cx = e.clientX; mouse.cy = e.clientY; mouse.inside = true; });
canvas.addEventListener('mouseleave', () => { mouse.inside = false; mouse.down = false; });
canvas.addEventListener('mouseenter', e => { mouse.cx = mouse.lcx = e.clientX; mouse.cy = mouse.lcy = e.clientY; mouse.inside = true; });
canvas.addEventListener('mousedown', e => {
  mouse.down = true;
  const lx = e.clientX / SCALE, ly = e.clientY / SCALE;
  if (!auto && petDistance(lx, ly) > PET_DIST * 1.6) {
    const b = bounds();
    deer.target = { x: clamp(lx, b.x0, b.x1), y: clamp(ly, b.y0, b.y1) };
    deer.targetRun = e.shiftKey;
    setState(e.shiftKey ? 'run' : 'walk');
  }
});
addEventListener('mouseup', () => { mouse.down = false; });

const MOVE_KEYS = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'];
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
  keys[k] = true; keys.shift = e.shiftKey;
  if (e.repeat) return;
  if (MOVE_KEYS.includes(k) && auto) { setAuto(false); toast('Manual mode · press T for auto'); }
  const map = { ' ': 'jump', e: 'graze', c: 'chew', v: 'chewlook', l: 'look', g: 'stare', z: 'sleep', r: 'rest', p: 'play' };
  if (k === 't') setAuto(!auto);
  else if (map[k]) doAction(map[k], true);
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; keys.shift = e.shiftKey; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ─────────────────────────── deer brain ───────────────────────────
const WALK = 20, RUN = 72, JUMP_H = 16, JUMP_DUR = 0.62;
const CURIOUS_DIST = 120, CURIOUS_SPEED = 380;
const PET_DIST = 20, PET_SPEED = 170, HOLD = 0.45;

function newDeer(seed) {
  const spr = document.createElement('canvas'); spr.width = DW; spr.height = DH;
  return {
    seed, spr, x: 0, y: 0, z: 0, face: 1, state: 'stand', st: 0, phase: 0, idleDur: 3, since: 0,
    target: null, targetRun: false, afterArrive: null, flower: null,
    jumpVX: 0, jumpVY: 0, chase: null, emitT: 0,
    playDur: 5, playV: { x: 0, y: 0 }, hopIdx: -1, sleepDur: 30, lie: 0, trust: 0, hold: 0,
    sm: null,
  };
}
// Every behavior function below acts on `deer`; the loop points it at each member of the herd in turn.
const herd = [newDeer(7)];
let deer = herd[0];
let auto = true;

// Options (the Mac app sets these from its menu; the browser panel has checkboxes)
const OPT = { ignore: false, watch: true, follow: false, friend: false, shy: false };
for (const key of Object.keys(OPT)) if (window.DEER_OPTS && key in window.DEER_OPTS) OPT[key] = !!window.DEER_OPTS[key];

const LABELS = {
  stand: 'standing', look: 'looking around', walk: 'walking', run: 'running', jump: 'jumping',
  sleep: 'sleeping', rest: 'resting', graze: 'eating grass', chew: 'chewing', chewlook: 'chew + look',
  stare: 'staring at you', curious: 'curious', fed: 'eating from hand', pet: 'being petted', play: 'playing',
};

function setState(s) {
  deer.state = s; deer.st = 0;
  if (s === 'sleep') deer.tuck = Math.random() < 0.5;   // sometimes tucks her head in
  if (s !== 'curious' && s !== 'fed' && s !== 'pet') deer.hold = 0;
}

function bodyCenter() { return { x: deer.x + deer.face * 4, y: deer.y - 31 - deer.z }; }
function headPos() {
  const low = deer.state === 'graze' ? 26 : deer.lie > 0.5 ? 12 : 0;
  return { x: deer.x + deer.face * 21, y: deer.y - 47 + low - deer.z };
}
function petDistance(x, y) {
  const h = headPos(), b = bodyCenter();
  return Math.min(Math.hypot(x - h.x, y - h.y), Math.hypot(x - b.x, y - b.y) - 8);
}

function stepToward(tx, ty, speed, dt) {
  const dx = tx - deer.x, dy = ty - deer.y, d = Math.hypot(dx, dy);
  if (d < 1.2) return true;
  const k = Math.min(1, speed * dt / d);
  deer.x += dx * k; deer.y += dy * k;
  if (Math.abs(dx) > 0.6) deer.face = sign(dx);
  deer.phase = (deer.phase + speed * dt / (speed > 40 ? 40 : 24)) % 1;
  return false;
}

function startJump() {
  if (deer.state === 'sleep' || deer.state === 'jump') return;
  let vx = 0, vy = 0;
  const dir = keyDir();
  if (dir.x || dir.y) { const sp = keys.shift ? RUN : WALK * 1.6; vx = dir.x * sp; vy = dir.y * sp * 0.6; }
  else if (deer.state === 'walk' || deer.state === 'run') { vx = deer.face * (deer.state === 'run' ? RUN : WALK * 1.5); }
  else vx = deer.face * 22;
  deer.jumpVX = vx; deer.jumpVY = vy;
  setState('jump');
}

function startPlay() {
  setState('play'); deer.playDur = rand(8, 13); deer.hopIdx = -1; deer.hopT = 0; deer.dart = false; deer.target = null;
}

function walkTo(x, y, run, after) {
  const b = bounds();
  deer.target = { x: clamp(x, b.x0, b.x1), y: clamp(y, b.y0, b.y1) };
  deer.targetRun = run; deer.afterArrive = after || null;
  setState(run ? 'run' : 'walk');
}

function nearestFlower() {
  let best = null, bd = 1e9;
  for (const f of flowers) {
    if (f.eaten) continue;
    const d = Math.hypot(f.x - deer.x, f.y - deer.y) + Math.random() * 40;
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function goEatFlower(run) {
  const f = nearestFlower();
  if (!f) { setState('graze'); deer.idleDur = rand(4, 7); return; }
  const face = Math.abs(f.x - deer.x) < 20 ? deer.face : sign(f.x - deer.x);
  deer.flower = f;
  walkTo(f.x - face * 20, f.y, run, 'graze');
}

function pickNext() {
  deer.idleDur = rand(2.5, 5);
  const b = bounds();
  if (deer.since > 50 && Math.random() < 0.35) { setState('sleep'); deer.sleepDur = rand(18, 35); return; }
  if (deer.since > 20 && Math.random() < 0.12) { setState('rest'); deer.idleDur = rand(8, 15); return; }
  const r = Math.random();
  if (r < 0.22) walkTo(rand(b.x0, b.x1), rand(b.y0, b.y1), false);
  else if (r < 0.46) goEatFlower(false);
  else if (r < 0.56) { setState('graze'); deer.flower = null; deer.idleDur = rand(4, 7); }
  else if (r < 0.61) setState('look');
  else if (r < 0.68) { setState('stare'); deer.idleDur = rand(2, 3.5); }
  else if (r < 0.78) startPlay();
  else if (r < 0.84) startJump();
  else if (r < 0.9) walkTo(rand(b.x0, b.x1), rand(b.y0, b.y1), true);
  else setState('stand');
}

function doAction(a, fromKey) {
  const b = bounds();
  if (deer.state === 'sleep' && a !== 'sleep' && a !== 'rest') deer.lie = Math.min(deer.lie, 0.59);
  switch (a) {
    case 'walk': walkTo(rand(b.x0, b.x1), rand(b.y0, b.y1), false); break;
    case 'run': walkTo(rand(b.x0, b.x1), rand(b.y0, b.y1), true); break;
    case 'jump': startJump(); break;
    case 'graze':
      if (deer.state === 'graze' && fromKey) { setState('chew'); deer.idleDur = rand(2, 4); }
      else if (auto) goEatFlower(false);
      else { setState('graze'); deer.flower = flowerInReach(); deer.idleDur = rand(4, 7); }
      break;
    case 'sleep':
      if (deer.state === 'sleep') setState('stand');
      else { setState('sleep'); deer.sleepDur = rand(20, 35); deer.target = null; }
      break;
    case 'play': startPlay(); break;
    case 'respawn': for (const f of flowers) f.eaten = false; toast('Flowers regrown 🌼'); break;
    default:
      if (deer.state === a && fromKey) setState('stand');
      else { setState(a); deer.idleDur = a === 'rest' ? rand(8, 14) : rand(3, 5); deer.target = null; }
  }
}

function flowerInReach() {
  const hx = deer.x + deer.face * 20;
  return flowers.find(f => !f.eaten && Math.abs(f.x - hx) < 7 && Math.abs(f.y - deer.y) < 6) || null;
}

function keyDir() {
  let x = 0, y = 0;
  if (keys.arrowleft || keys.a) x -= 1;
  if (keys.arrowright || keys.d) x += 1;
  if (keys.arrowup || keys.w) y -= 1;
  if (keys.arrowdown || keys.s) y += 1;
  return { x, y };
}

// Shared cursor logic. Returns true if the cursor is currently "in charge" of her.
function cursorReact(dt) {
  const s = deer.state;
  const engaged = s === 'curious' || s === 'fed' || s === 'pet';
  if (OPT.ignore || OPT.shy) { if (engaged) { setState('look'); deer.idleDur = rand(2, 4); } return false; }   // auto / shy: no approaching
  if (!mouse.inside) { if (engaged) setState(auto ? 'look' : 'stand'); return false; }
  const b = bodyCenter();
  const dBody = Math.hypot(mouse.x - b.x, mouse.y - b.y);
  const dPet = petDistance(mouse.x, mouse.y);

  if (s === 'jump') return false;

  const calm = mouse.speed < PET_SPEED;
  const inPet = dPet < PET_DIST;
  const inCurious = dBody < CURIOUS_DIST && mouse.speed < CURIOUS_SPEED;

  if (s === 'sleep') return false;   // let her nap — the cursor never wakes her

  if (engaged) {
    if (s === 'fed' && Math.abs(mouse.x - deer.x) > 10) deer.face = sign(mouse.x - deer.x);
    if (inPet && calm) {
      deer.hold += dt;
      if (mouse.down) { if (s !== 'fed') setState('fed'); deer.trust = Math.min(1, deer.trust + dt * 0.12); }
      else if (s === 'fed') setState('pet');
      else if (s === 'curious' && deer.hold > HOLD) setState('pet');
      if (deer.state === 'pet') deer.trust = Math.min(1, deer.trust + dt * 0.06);
      return true;
    }
    deer.hold = 0;
    if (s === 'curious' && mouse.still > 6) { setState(auto ? 'look' : 'stand'); deer.idleDur = rand(2, 4); return true; }
    if (inCurious || dPet < PET_DIST * 1.8) { if (s !== 'curious') setState('curious'); return true; }
    setState(auto ? 'look' : 'stand'); deer.idleDur = rand(2, 4);
    return true;
  }

  const idle = ['stand', 'look', 'stare', 'walk', 'graze', 'chew', 'chewlook', 'play'].includes(s);
  if (auto && idle && inCurious) { deer.target = null; setState('curious'); return true; }
  if (!auto && inPet && calm && ['stand', 'look', 'stare', 'graze', 'chew', 'chewlook'].includes(s)) { setState('curious'); return true; }
  return false;
}

function playStep(dt) {
  deer.hopT += dt;
  if (deer.hopIdx < 0 || deer.hopT >= deer.hopLen) {
    if (deer.hopIdx >= 0 && deer.st > deer.playDur) { deer.z = 0; deer.dart = false; setState('stand'); deer.idleDur = rand(1.5, 3); return; }
    deer.hopIdx++; deer.hopT = 0;
    // She bounds a long way in one direction, then scatters: a fast leap that snaps her
    // back the other way, and off she goes again.
    const b = bounds(), edge = 30;
    const nearEdge = (deer.playDir > 0 && deer.x > b.x1 - edge) || (deer.playDir < 0 && deer.x < b.x0 + edge);
    deer.dart = deer.hopIdx > 0 && (deer.runLeft <= 0 || nearEdge);
    if (deer.hopIdx === 0) {
      deer.playDir = deer.x < (b.x0 + b.x1) / 2 ? 1 : -1;
      deer.runLeft = rand(2, 4);
    }
    // playing with a friend: chase her if she's far off, otherwise bound alongside her
    const pal = deer.chase;
    if (pal && pal.state === 'play' && deer.hopIdx > 0) {
      const dx = pal.x - deer.x;
      const want = Math.abs(dx) > 34 ? sign(dx) : pal.playDir;
      deer.dart = want !== deer.playDir;
      if (deer.dart) deer.playDir = -want;   // flipped back just below
      deer.runLeft = 99;
    }
    if (deer.dart) {
      deer.playDir = -deer.playDir;
      deer.runLeft = rand(2, 4);                                // next long stretch
      deer.hopLen = 0.36;
      deer.playV = { x: deer.playDir * rand(66, 84), y: rand(-12, 12) };
      spawn('dust', deer.x - 4, deer.y); spawn('dust', deer.x + 4, deer.y);
    } else {
      deer.hopLen = rand(0.36, 0.46);
      deer.playV = { x: deer.playDir * rand(42, 54), y: rand(-9, 9) };   // keep bounding the same way
    }
    if (Math.abs(deer.playV.x) > 3) deer.face = sign(deer.playV.x);
  }
  deer.runLeft -= dt;
  const p = deer.hopT / deer.hopLen;
  deer.z = Math.sin(p * Math.PI) * (deer.dart ? 10 : 7);
  const b = bounds();
  deer.x = clamp(deer.x + deer.playV.x * dt, b.x0, b.x1);
  deer.y = clamp(deer.y + deer.playV.y * dt, b.y0, b.y1);
}

function jumpStep(dt) {
  const p = deer.st / JUMP_DUR;
  const b = bounds();
  if (p > 0.15) {
    deer.z = Math.sin(Math.PI * clamp((p - 0.15) / 0.85, 0, 1)) * JUMP_H;
    deer.x = clamp(deer.x + deer.jumpVX * dt, b.x0, b.x1);
    deer.y = clamp(deer.y + deer.jumpVY * dt, b.y0, b.y1);
  }
  if (p >= 1) {
    deer.z = 0;
    spawn('dust', deer.x - 8, deer.y); spawn('dust', deer.x + 8, deer.y);
    const dir = keyDir();
    if (!auto && (dir.x || dir.y)) setState(keys.shift ? 'run' : 'walk');
    else { setState('stand'); deer.idleDur = rand(1.5, 3); }
  }
}

function updateWorld(dt, t) {
  // cursor tracking (speed in real screen px/s so thresholds don't depend on SCALE)
  const mdx = mouse.cx - mouse.lcx, mdy = mouse.cy - mouse.lcy;
  mouse.speed = mouse.speed * 0.65 + (Math.hypot(mdx, mdy) / Math.max(dt, 1e-3)) * 0.35;
  mouse.still = Math.hypot(mdx, mdy) > 0.5 ? 0 : (mouse.still || 0) + dt;
  mouse.lcx = mouse.cx; mouse.lcy = mouse.cy;
  mouse.x = mouse.cx / SCALE; mouse.y = mouse.cy / SCALE;

  for (const f of flowers) if (f.eaten && (f.regrow -= dt) <= 0) f.eaten = false;
  updateButterflies(dt, t);
  updateParticles(dt, t);
  socialStep(dt);
}

function updateDeer(dt) {
  deer.st += dt; deer.since += dt;

  // lying down / getting up
  const lieTarget = deer.state === 'sleep' || deer.state === 'rest' ? 1 : 0;
  deer.lie = clamp(deer.lie + Math.sign(lieTarget - deer.lie) * dt / 1.1, 0, 1);
  if (deer.state !== 'jump' && deer.state !== 'play') deer.z = 0;

  const s = deer.state;
  if (s === 'curious' || s === 'fed' || s === 'pet') deer.since = 0;

  if (auto || deer !== herd[0]) autoStep(dt); else manualStep(dt);   // the friend always does her own thing
  // ears swivel independently to listen: each picks a new direction now and then
  const es = deer.ears || (deer.ears = { n: 0, f: 0, tn: 0, tf: 0, cd: 1 });
  if ((es.cd -= dt) <= 0) {
    const r = Math.random();
    if (r < 0.4) es.tn = rand(-0.9, 0.45);           // just the near ear
    else if (r < 0.8) es.tf = rand(-0.9, 0.45);      // just the far ear
    else { es.tn = rand(-0.8, 0.4); es.tf = rand(-0.8, 0.4); }
    if (Math.random() < 0.25) { es.tn = 0; es.tf = 0; }
    es.cd = rand(0.8, 3.5);
  }
  es.n += (es.tn - es.n) * Math.min(1, dt * 12); es.f += (es.tf - es.f) * Math.min(1, dt * 12);
  // every so often a quick burst of tail swishes to swat flies
  deer.swat = Math.max(0, (deer.swat || 0) - dt);
  if ((deer.swatCD = (deer.swatCD ?? rand(3, 8)) - dt) <= 0) { deer.swat = rand(0.5, 0.9); deer.swatCD = rand(4, 12); }
  updateHeadMode(dt);
  // airborne phase of each gallop stride
  if (deer.state === 'run') deer.z = Math.max(0, Math.sin(deer.phase * TAU)) * 5.5;
  emitParticles(dt);
}

// ─────────────────────────── friend mode ───────────────────────────
// A "director" that every so often has the two fawns do something together:
// play (one chases the other), run around together, sleep side by side, or drift apart.
const social = { cd: 4, legs: 0, sleepDur: 30, dir: 1 };
const FREE = ['stand', 'look', 'stare', 'graze', 'chew', 'chewlook', 'walk'];
function asDeer(d, fn) { const keep = deer; deer = d; fn(); deer = keep; }

function setFriend(on) {
  OPT.friend = on;
  if (on && herd.length === 1) {
    const f = newDeer(23), b = bounds();
    f.x = clamp(herd[0].x + (herd[0].x > (b.x0 + b.x1) / 2 ? -60 : 60), b.x0, b.x1);
    f.y = DESK ? b.y0 : clamp(herd[0].y - 6, b.y0, b.y1);   // a touch further back, so they layer nicely
    f.face = sign(herd[0].x - f.x);
    if (DESK) {
      f.cv = document.createElement('canvas'); f.cv.className = 'deerCanvas';
      (canvas.parentNode || document.body).insertBefore(f.cv, canvas); sizeCanvas(f.cv);
    }
    herd.push(f);
    herd[0].partner = f; f.partner = herd[0];
    social.cd = 3;
  } else if (!on && herd.length > 1) {
    const f = herd.pop();
    f.cv?.remove();
    herd[0].partner = null; herd[0].chase = null;
    particles = particles.filter(p => p.owner !== f);
  }
}

function socialStep(dt) {
  if (herd.length < 2 || !auto) return;
  const [a, b] = herd;
  if ((social.cd -= dt) > 0) return;
  if (!FREE.includes(a.state) || !FREE.includes(b.state)) { social.cd = 1; return; }
  social.cd = rand(10, 18);
  const sleepy = a.since > 25 && b.since > 25;
  const r = Math.random();
  const lead = Math.random() < 0.5 ? a : b, other = lead === a ? b : a;
  if (r < 0.36) {                                     // play together: one leads, the other chases
    const dur = rand(8, 13);
    asDeer(lead, () => { startPlay(); deer.playDur = dur; deer.chase = null; });
    asDeer(other, () => { startPlay(); deer.playDur = dur; deer.chase = lead; });
  } else if (r < 0.6) {                               // run around together
    social.legs = 2 + Math.floor(Math.random() * 2);
    social.dir = lead.x < (bounds().x0 + bounds().x1) / 2 ? 1 : -1;
    socialRunLeg(lead, other);
  } else if (r < (sleepy ? 0.85 : 0.68)) {            // walk over and curl up side by side
    const bb = bounds(), mx = clamp((a.x + b.x) / 2, bb.x0 + 20, bb.x1 - 20);
    social.sleepDur = rand(25, 40);
    asDeer(a, () => walkTo(mx - (a.x < b.x ? 13 : -13), deer.y, false, 'sleepTogether'));
    asDeer(b, () => walkTo(mx + (a.x < b.x ? 13 : -13), deer.y, false, 'sleepTogether'));
  } else {                                            // aloof: wander off away from each other
    const bb = bounds(), left = a.x < b.x ? a : b, right = left === a ? b : a;
    asDeer(left, () => walkTo(rand(bb.x0, bb.x0 + (bb.x1 - bb.x0) * 0.3), deer.y, false));
    asDeer(right, () => walkTo(rand(bb.x1 - (bb.x1 - bb.x0) * 0.3, bb.x1), deer.y, false));
  }
}

// One leg of running around together: both gallop to the far side, the follower just behind.
function socialRunLeg(lead = herd[0], other = herd[1]) {
  if (!other || social.legs-- <= 0) { if (deer.state === 'walk' || deer.state === 'run') pickNext(); return; }
  const bb = bounds();
  social.dir = -social.dir;
  const tx = social.dir > 0 ? rand(bb.x1 - 80, bb.x1) : rand(bb.x0, bb.x0 + 80);
  asDeer(lead, () => walkTo(tx, deer.y, true, 'runLeg'));
  asDeer(other, () => walkTo(tx - social.dir * 22, deer.y, true, null));
}

// "Follow the cursor": walk (or run, if it's far) to stand beside it. Returns true while travelling.
function followCursor(dt) {
  if (!OPT.follow || OPT.ignore || !mouse.inside) return false;
  const s = deer.state;
  if (['curious', 'fed', 'pet', 'jump', 'sleep', 'rest'].includes(s)) return false;
  const side = deer === herd[0] ? 0 : (deer.x < mouse.x ? -24 : 24);   // the friend keeps a little to one side
  const b = bounds(), tx = clamp(mouse.x + side, b.x0, b.x1), dx = tx - deer.x;
  if (Math.abs(dx) > 22 || ((s === 'walk' || s === 'run') && Math.abs(dx) > 4)) {
    const run = Math.abs(dx) > 110 || (s === 'run' && Math.abs(dx) > 40);
    if (s !== (run ? 'run' : 'walk')) setState(run ? 'run' : 'walk');
    deer.target = null; deer.afterArrive = null;
    stepToward(tx, deer.y, run ? RUN : WALK * 1.6, dt);
    return true;
  }
  if (s === 'walk' || s === 'run' || s === 'play') {
    setState('stand'); deer.idleDur = rand(2, 4);
    if (Math.abs(mouse.x - deer.x) > 6) deer.face = sign(mouse.x - deer.x);
  }
  return false;
}

// "Move out of the way": is the cursor on top of her?
function cursorOnDeer() {
  return mouse.inside && Math.abs(mouse.x - (deer.x + deer.face * 4)) < 26 &&
    mouse.y > deer.y - 62 - deer.z && mouse.y < deer.y + 4;
}
// Shy mode: fade see-through while the cursor is over her, and (if she's up) trot aside.
function shyStep(dt) {
  deer.hovered = OPT.shy && cursorOnDeer();
  deer.alpha = (deer.alpha ?? 1) + ((deer.hovered ? 0.2 : 1) - (deer.alpha ?? 1)) * Math.min(1, dt * 12);
  if (!deer.hovered || ['sleep', 'rest', 'jump'].includes(deer.state) || deer.shyRun) return;
  const b = bounds();
  let dir = sign(deer.x - mouse.x);
  if ((dir > 0 && deer.x > b.x1 - 60) || (dir < 0 && deer.x < b.x0 + 60)) dir = -dir;   // cornered: go past
  deer.shyRun = true;
  walkTo(clamp(mouse.x + dir * rand(90, 140), b.x0, b.x1), deer.y, true, 'shyDone');
}

function autoStep(dt) {
  cursorReact(dt);
  shyStep(dt);
  if (followCursor(dt)) return;
  const s = deer.state;
  switch (s) {
    case 'curious': case 'fed': case 'pet': break;
    case 'jump': jumpStep(dt); break;
    case 'play': playStep(dt); break;
    case 'walk': case 'run':
      if (!deer.target || stepToward(deer.target.x, deer.target.y, s === 'run' ? RUN : WALK, dt)) {
        deer.target = null;
        const after = deer.afterArrive; deer.afterArrive = null;
        if (after === 'graze') {
          if (deer.flower) deer.face = sign(deer.flower.x - deer.x);
          setState('graze'); deer.idleDur = rand(4, 7);
        } else if (after === 'runLeg') socialRunLeg();
        else if (after === 'shyDone') { deer.shyRun = false; setState('look'); deer.idleDur = rand(2, 4); }
        else if (after === 'sleepTogether') {
          const f = deer.partner;
          if (f) deer.face = sign(f.x - deer.x) || deer.face;       // curl up facing her friend
          setState('sleep'); deer.sleepDur = social.sleepDur;
        } else pickNext();
      }
      break;
    case 'graze':
      if (deer.st > deer.idleDur) { eatFlowerIfAny(); setState('chew'); deer.idleDur = rand(2, 4); }
      break;
    case 'chew':
      if (deer.st > deer.idleDur) { if (Math.random() < 0.55) { setState('chewlook'); deer.idleDur = rand(2.5, 4.5); } else pickNext(); }
      break;
    case 'sleep':
      if (deer.st > deer.sleepDur) {
        deer.since = 0;
        if (Math.random() < 0.5) { setState('rest'); deer.idleDur = rand(8, 14); } else { setState('stand'); deer.idleDur = rand(2, 3); }
      }
      break;
    case 'rest':
      if (deer.st > deer.idleDur) { if (Math.random() < 0.25) { setState('sleep'); deer.sleepDur = rand(18, 30); } else { setState('stand'); deer.idleDur = rand(2, 3); } }
      break;
    default:
      if (deer.st > deer.idleDur) pickNext();
  }
}

function manualStep(dt) {
  const s = deer.state;
  if (s === 'jump') { jumpStep(dt); return; }

  const dir = keyDir();
  if (dir.x || dir.y) {
    deer.target = null;
    const running = keys.shift, want = running ? 'run' : 'walk';
    if (deer.state !== want) setState(want);
    const sp = running ? RUN : WALK * 1.4, n = Math.hypot(dir.x, dir.y);
    const b = bounds();
    deer.x = clamp(deer.x + dir.x / n * sp * dt, b.x0, b.x1);
    deer.y = clamp(deer.y + dir.y / n * sp * 0.6 * dt, b.y0, b.y1);
    if (dir.x) deer.face = dir.x;
    deer.phase = (deer.phase + sp * dt / (running ? 40 : 24)) % 1;
    return;
  }
  if (deer.target) {
    if (stepToward(deer.target.x, deer.target.y, deer.targetRun ? RUN : WALK * 1.4, dt)) { deer.target = null; setState('stand'); }
    return;
  }
  if (cursorReact(dt)) return;
  switch (s) {
    case 'walk': case 'run': setState('stand'); break;
    case 'play': playStep(dt); break;
    case 'graze': if (deer.st > deer.idleDur) { eatFlowerIfAny(); deer.st = 0; deer.flower = flowerInReach(); } break;
  }
}

function eatFlowerIfAny() {
  const f = deer.flower && !deer.flower.eaten ? deer.flower : flowerInReach();
  if (f) {
    f.eaten = true; f.regrow = rand(25, 45);
    for (let i = 0; i < 5; i++) spawn('petal', f.x, f.y - 4, f.c);
  }
  deer.flower = null;
}

// ─────────────────────────── poses ───────────────────────────
function basePose() {
  return {
    bob: 0, crouch: 0, neck: -1.05, neckLen: 15, tilt: 0, earPerk: 0.75, earFlick: 0,
    eye: 1, eyeWide: 0, chew: 0, tongue: 0, pitch: 0, stare: 0, back: 0, earN: 0, earF: 0, lookAng: 0, tuck: false, awake: 0, tailRaise: 0.05, tailWag: 0, lie: 0,
    legs: [{ s: 0.04, f: 0 }, { s: 0.02, f: 0 }, { s: 0, f: 0 }, { s: -0.02, f: 0 }],
  };
}
const blink = t => ((t % 3.7) > 3.56 ? 0.1 : 1);
const flick = t => ((t * 0.7) % 5 < 0.22 ? Math.sin(t * 45) * 0.35 : 0);

// order: front-far, front-near, hind-far, hind-near
function gait(P, phase, A, F, offs) {
  for (let i = 0; i < 4; i++) {
    const th = (phase + offs[i]) * TAU;
    P.legs[i] = { s: A * Math.sin(th), f: F * Math.max(0, Math.cos(th)) };
  }
}

const TRACK_STATES = ['stand', 'look', 'chew', 'chewlook', 'stare', 'curious', 'pet', 'rest'];
function headTracking() {
  return OPT.watch && !OPT.ignore && mouse.inside && mouse.still < 4 && TRACK_STATES.includes(deer.state) &&
    (deer.lie === 0 || deer.state === 'rest');
}

// Which way her head points relative to her body, with hysteresis so it doesn't flicker.
function updateHeadMode(dt) {
  if (!headTracking()) { deer.headMode = 'fwd'; deer.behindT = 0; return; }
  const dx = aimNeck(mouse.x, mouse.y).dx;
  if (dx > 14) deer.headMode = 'fwd';
  else if (dx < -14) deer.headMode = 'back';
  else if (Math.abs(dx) < 7) deer.headMode = 'front';
  // only turn the whole body if you've been hanging out behind her for a while
  deer.behindT = deer.headMode === 'back' ? deer.behindT + dt : 0;
  const patience = deer.state === 'curious' || deer.state === 'pet' ? 2.5 : 6;
  if (auto && deer.state !== 'rest' && deer.behindT > patience) { deer.face = -deer.face; deer.behindT = 0; deer.headMode = 'fwd'; }
}

function aimNeck(tx, ty) {
  const bx = deer.x + deer.face * (RIG.nbx - ANCHOR_X), by = deer.y - (GROUND - PAD - RIG.nby) - deer.z;
  const dx = (tx - bx) * deer.face, dy = ty - by;
  return { n: clamp(Math.atan2(dy, Math.max(3, dx)) - 0.25, -1.5, 1.3), d: Math.hypot(dx, dy), dx, dy };
}

function poseFor(t) {
  const P = basePose(), s = deer.state, st = deer.st;
  P.eye = blink(t); P.earFlick = flick(t);
  // every so often she licks her nose
  const lickCycle = (t + 2) % 8;
  if (lickCycle < 0.7) P.tongue = Math.sin((lickCycle / 0.7) * Math.PI);
  switch (s) {
    case 'stand':
      P.bob = Math.sin(t * 1.8) * 0.35; P.tailWag = Math.sin(t * 1.3) * 0.15; break;
    case 'stare':
      P.stare = 1; P.neck = -1.4; P.earPerk = 1; P.bob = Math.sin(t * 1.8) * 0.25;
      P.tilt = Math.sin(t * 0.5) * 0.12; P.tailWag = Math.sin(t * 1.3) * 0.1; break;
    case 'look':
      if (st > 1.4 && st < 3.2) P.stare = 1;          // glances right at you mid look-around
      P.neck = -1.15 + Math.sin(t * 0.9) * 0.28; P.tilt = Math.sin(t * 0.6) * 0.3; P.earPerk = 0.95;
      P.bob = Math.sin(t * 1.8) * 0.3; break;
    case 'walk':
      gait(P, deer.phase, 0.38, 0.9, [0.75, 0.25, 0.5, 0]);
      P.bob = Math.abs(Math.sin(deer.phase * TAU * 2)) * 0.5;
      P.neck = -1.0 + Math.sin(deer.phase * TAU * 2) * 0.06; P.tailWag = Math.sin(t * 3) * 0.15; break;
    case 'run':
      // Bounding gallop. phase .25 = fully stretched out & airborne (front reaching, hind
      // pushed back straight); phase .75 = gathered (hind legs swing up under the chest).
      // Legs fold while swinging forward and are straight while they're on the ground.
      for (let i = 0; i < 4; i++) {
        const hind = i >= 2, th = (deer.phase + [0, 0.06, 0.5, 0.57][i]) * TAU;
        P.legs[i] = { s: (hind ? 1.0 : 0.85) * Math.sin(th), f: (hind ? 1.15 : 1.3) * Math.max(0, Math.cos(th)) ** 0.8 };
      }
      P.pitch = Math.sin((deer.phase - 0.15) * TAU) * 0.1;   // lands on the front, pushes off the back
      P.bob = 0; P.neck = -0.8 + Math.sin(deer.phase * TAU + 1) * 0.14;
      P.earPerk = 0.3; P.tailRaise = 1; P.tailWag = Math.sin(t * 12) * 0.06; break;   // tail straight up, flagged white
    case 'jump': {
      const p = st / JUMP_DUR;
      if (p < 0.15) { P.crouch = 0.6; P.legs = P.legs.map(() => ({ s: 0, f: 0.55 })); }
      else if (p < 0.8) {
        P.legs = [{ s: 0.55, f: 1.1 }, { s: 0.6, f: 1.15 }, { s: -0.55, f: 0.15 }, { s: -0.6, f: 0.1 }];
      } else {
        P.legs = [{ s: 0.3, f: 0.2 }, { s: 0.35, f: 0.15 }, { s: 0.15, f: 0.6 }, { s: 0.1, f: 0.6 }];
      }
      P.neck = -1.25; P.tailRaise = 0.45; P.earPerk = 0.6; break;
    }
    case 'play':
      if (deer.dart && deer.z > 1) {             // scatter leap: stretched out flat
        P.legs = [{ s: 0.75, f: 0.35 }, { s: 0.85, f: 0.25 }, { s: -0.8, f: 0.05 }, { s: -0.9, f: 0 }];
        P.pitch = -0.12 + (deer.hopT / deer.hopLen) * 0.22; P.tailRaise = 0.9;
      } else if (deer.z > 1) P.legs = P.legs.map((L, i) => ({ s: i < 2 ? 0.12 : -0.08, f: 0.15 }));
      else { P.crouch = 0.3; P.legs = P.legs.map(() => ({ s: 0, f: 0.35 })); }
      P.neck = -1.25 + Math.sin(t * 9) * 0.22; P.tailWag = Math.sin(t * 18);
      if (!deer.dart) P.tailRaise = 0.55;
      P.tongue = deer.z > 1 ? 0.75 + Math.sin(t * 14) * 0.2 : 0.35;   // silly tongue out while hopping
      P.earPerk = 0.9; break;
    case 'sleep':
      P.neck = 0.2; P.earPerk = 0.2; P.eye = deer.lie > 0.3 ? 0 : 1; P.tuck = !!deer.tuck; break;
    case 'rest':
      P.awake = 1; P.neck = -1.2 + Math.sin(t * 0.5) * 0.15; P.earPerk = 0.85; P.tilt = Math.sin(t * 0.4) * 0.12;
      if (deer.st % 9 > 6.5) P.stare = 1;          // glances over at you now and then
      break;
    case 'graze':
      P.neck = 1.25; P.neckLen = 22; P.crouch = 0.12; P.chew = Math.sin(t * 9) * 0.5 + 0.5;
      P.tilt = -0.3 + Math.sin(t * 0.7) * 0.08;   // muzzle angled forward into the grass
      P.legs[0].s = 0.2; P.legs[1].s = -0.04; P.earPerk = 0.55; P.tailWag = Math.sin(t * 1.1) * 0.2; break;
    case 'chew':
      P.neck = -0.95; P.chew = Math.sin(t * 6) * 0.5 + 0.5; P.bob = Math.sin(t * 1.8) * 0.3; break;
    case 'chewlook':
      P.neck = -1.05 + Math.sin(t * 0.8) * 0.25; P.tilt = Math.sin(t * 0.55) * 0.28;
      P.chew = Math.sin(t * 6) * 0.5 + 0.5; P.earPerk = 0.9; break;
    case 'curious': {
      const a = aimNeck(mouse.x, mouse.y);
      P.neck = lerp(-1.2, a.n, 0.75); P.earPerk = 1; P.tilt = Math.sin(t * 1.3) * 0.15;
      P.tailWag = Math.sin(t * 3) * 0.3; P.tailRaise = 0.1; break;
    }
    case 'fed': {
      const a = aimNeck(mouse.x, mouse.y);
      P.neck = a.n; P.neckLen = clamp(a.d - 11, 13, 22); P.chew = Math.sin(t * 12) * 0.5 + 0.5;
      P.tongue = Math.max(0, Math.sin(t * 7)); // licking your hand
      P.eye = 0.8; P.earPerk = 0.8; P.tailRaise = 0.3; P.tailWag = Math.sin(t * 9) * 0.7; break;
    }
    case 'pet': {
      const a = aimNeck(mouse.x, mouse.y);
      P.neck = lerp(-0.8, a.n, 0.5); P.eye = 0.35; P.earPerk = 0.35; P.tilt = Math.sin(t * 1.5) * 0.15;
      P.tongue = 0.45 + Math.max(0, Math.sin(t * 2.2)) * 0.5; // happy blep
      P.tailRaise = 0.25; P.tailWag = Math.sin(t * 7) * 0.55; P.bob = Math.sin(t * 1.2) * 0.3; break;
    }
  }

  // watch a nearby butterfly while idle
  if (['stand', 'look', 'chew', 'chewlook'].includes(s)) {
    const b = butterflies.find(b => Math.hypot(b.x - deer.x, b.y - deer.y) < 70 && sign(b.x - deer.x) === deer.face);
    if (b) { P.neck = lerp(P.neck, clamp(aimNeck(b.x, b.y - b.alt).n, -1.5, -0.55), 0.7); P.earPerk = 1; }
  }

  if (s !== 'sleep' && deer.ears) { P.earN = deer.ears.n; P.earF = deer.ears.f; }
  if (deer.swat > 0 && !['run', 'jump', 'play', 'sleep'].includes(s)) {
    P.tailWag = Math.sin(t * 40) * 0.95; P.tailRaise = Math.max(P.tailRaise, 0.2);
  }

  // follow the cursor with her head while she's awake and standing in place
  if (headTracking()) {
    const a = aimNeck(mouse.x, mouse.y);
    const m = deer.headMode;
    if (m === 'fwd') { P.stare = 0; P.neck = clamp(a.n, -1.5, 0.45); P.tilt *= 0.3; }
    else if (m === 'front') { P.stare = 1; P.neck = -1.4; P.tilt = clamp(a.dy / 120, -0.25, 0.25); }
    else {
      // swivel the head back over her shoulder, body stays put
      P.stare = 0; P.back = 1; P.neck = -1.85;
      P.lookAng = clamp(Math.atan2(a.dy + 13, Math.max(4, -a.dx)), -0.8, 0.5);
    }
    P.earPerk = Math.max(P.earPerk, 0.85);
  }

  // lying down / getting up blends into the curled sleeping sprite
  if (deer.lie > 0) {
    if (deer.lie >= 0.6) P.lie = 1;
    else {
      const k = deer.lie / 0.6;
      P.crouch += k * 1.4; P.legs = P.legs.map(L => ({ s: L.s * (1 - k), f: L.f + k * 1.3 }));
      if (deer.state !== 'rest') { P.neck = lerp(P.neck, 0.2, k); P.earPerk = lerp(P.earPerk, 0.2, k); }
    }
  }
  return P;
}

// Smooth the big "posture" channels so state changes ease instead of snapping.
function smoothPose(P, dt) {
  const keysS = { neck: 9, neckLen: 9, earPerk: 12, tailRaise: 14, crouch: 12, tilt: 8, pitch: 14 };
  if (!deer.sm) { deer.sm = {}; for (const k in keysS) deer.sm[k] = P[k]; }
  for (const k in keysS) { deer.sm[k] += (P[k] - deer.sm[k]) * Math.min(1, dt * keysS[k]); P[k] = deer.sm[k]; }
  return P;
}

// ─────────────────────────── butterflies & particles ───────────────────────────
function updateButterflies(dt, t) {
  const b = bounds();
  for (const f of butterflies) {
    f.t += dt;
    f.vx += rand(-40, 40) * dt; f.vy += rand(-25, 25) * dt;
    const sp = Math.hypot(f.vx, f.vy); if (sp > 16) { f.vx *= 16 / sp; f.vy *= 16 / sp; }
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.x < b.x0 || f.x > b.x1) f.vx *= -1;
    if (f.y < b.y0 - 10 || f.y > b.y1) f.vy *= -1;
    f.x = clamp(f.x, b.x0, b.x1); f.y = clamp(f.y, b.y0 - 10, b.y1);
    f.alt = 14 + Math.sin(f.t * 2.1) * 6;
  }
}

let particles = [];
function spawn(type, x, y, c) {
  const p = { type, x, y, c, life: 1, vx: 0, vy: 0, owner: deer };
  if (type === 'heart') { p.vx = rand(-4, 4); p.vy = -12; p.life = 1.3; }
  if (type === 'crumb' || type === 'petal') { p.vx = rand(-12, 12); p.vy = rand(-18, -6); p.life = 0.7; p.g = 60; }
  if (type === 'z') { p.vx = 5; p.vy = -7; p.life = 2; }
  if (type === 'dust') { p.vx = rand(-8, 8); p.vy = rand(-4, -1); p.life = 0.45; }
  particles.push(p);
}
function emitParticles(dt) {
  deer.emitT += dt;
  const s = deer.state, h = headPos();
  if (deer.emitT > 0.12) {
    deer.emitT = 0;
    if (s === 'pet' && Math.random() < 0.3) spawn('heart', deer.x + deer.face * 4 + rand(-6, 6), deer.y - 44);
    if (s === 'fed' && Math.random() < 0.6) spawn('crumb', mouse.x, mouse.y, '#4f9a3a');
    if (s === 'graze' && Math.random() < 0.25) spawn('crumb', h.x + deer.face * 4, deer.y - 2, '#5d9a42');
    if (s === 'sleep' && deer.lie >= 1 && Math.random() < 0.12) spawn('z', deer.x + deer.face * 14, deer.y - 20);
    if (s === 'run' && Math.random() < 0.6) spawn('dust', deer.x - deer.face * 10, deer.y);
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.g) p.vy += p.g * dt;
    if (p.type === 'heart') p.vx = Math.sin(p.life * 8) * 5;
  }
  particles = particles.filter(p => p.life > 0);
}

// ─────────────────────────── pixel maps ───────────────────────────
const MAPS = {
  heart: ['.#.#.', '#####', '#####', '.###.', '..#..'],
  z: ['###', '..#', '.#.', '#..', '###'],
  hand: [
    '....##......', '...#ww#.....', '...#ww#.....', '...#ww###...', '...#ww#ww##.',
    '.###ww#ww#w#', '#ww#wwwwww#.', '#wwwwwwwwww#', '.#wwwwwwwww#', '..#wwwwwwww#',
    '...#wwwwww#.', '....######..',
  ],
  clover: ['.g.g.', 'ggggg', '.ggg.', '..s..', '..s..'],
};
function drawMap(g, map, x, y, colors) {
  x = Math.round(x); y = Math.round(y);
  for (let r = 0; r < map.length; r++) for (let c = 0; c < map[r].length; c++) {
    const ch = map[r][c]; if (ch === '.') continue;
    g.fillStyle = colors[ch]; g.fillRect(x + c, y + r, 1, 1);
  }
}

// ─────────────────────────── render ───────────────────────────
function drawDeer(t, P) {
  const x = Math.round(deer.x), y = Math.round(deer.y);
  // ground shadow (stays on the ground while she's in the air)
  const sw = Math.round((P.lie ? 34 : 26) * (1 - Math.min(deer.z, 16) / 40));
  wg.fillStyle = 'rgba(40,70,20,0.28)';
  wg.fillRect(x - (sw >> 1) + deer.face * 2, y - 1, sw, 2);
  wg.fillRect(x - (sw >> 1) + 2 + deer.face * 2, y + 1, sw - 4, 1);

  const sy = Math.round(y - GROUND - deer.z);
  if (deer.face > 0) wg.drawImage(deer.spr, x - ANCHOR_X, sy);
  else { wg.save(); wg.translate(x, 0); wg.scale(-1, 1); wg.drawImage(deer.spr, -ANCHOR_X, sy); wg.restore(); }
}

function drawTuft(f, t) {
  const sway = Math.round(Math.sin(t * 1.5 + f.p + f.x * 0.05) * 0.8);
  wg.fillStyle = f.c;
  for (let b = -1; b <= 1; b++) {
    const h = f.h - Math.abs(b);
    wg.fillRect(f.x + b, f.y - h + 1, 1, h - 1);
    wg.fillRect(f.x + b + (b === 0 ? sway : b + sway), f.y - h, 1, 1);
  }
}
function drawFlower(f) {
  wg.fillStyle = '#4c8a38'; wg.fillRect(f.x, f.y - 3, 1, 3); wg.fillRect(f.x + 1, f.y - 2, 1, 1);
  wg.fillStyle = f.c;
  wg.fillRect(f.x - 1, f.y - 5, 3, 1); wg.fillRect(f.x, f.y - 6, 1, 3);
  wg.fillStyle = f.c === '#f2c94c' ? '#c9892a' : '#f2c94c'; wg.fillRect(f.x, f.y - 5, 1, 1);
}
function drawButterfly(f, t) {
  const x = Math.round(f.x), y = Math.round(f.y - f.alt), up = Math.sin(t * 22 + f.t) > 0;
  wg.fillStyle = 'rgba(40,70,20,0.2)'; wg.fillRect(x, Math.round(f.y), 2, 1);
  wg.fillStyle = '#3b2317'; wg.fillRect(x, y, 1, 2);
  wg.fillStyle = f.c;
  if (up) { wg.fillRect(x - 2, y - 2, 2, 2); wg.fillRect(x + 1, y - 2, 2, 2); }
  else { wg.fillRect(x - 2, y, 2, 2); wg.fillRect(x + 1, y, 2, 2); }
}
function drawClouds(t) {
  for (const c of clouds) {
    const x = Math.round(((c.x + t * c.v) % (W + 60)) - 30), y = Math.round(c.y);
    wg.fillStyle = '#ffffff';
    wg.fillRect(x, y + 2, c.w, 3); wg.fillRect(x + 3, y, c.w * 0.5 | 0, 3); wg.fillRect(x + (c.w * 0.45 | 0), y - 1, c.w * 0.35 | 0, 3);
    wg.fillStyle = '#e3eef2'; wg.fillRect(x + 1, y + 5, c.w - 2, 1);
  }
}

function render(t) {
  if (DESK) { renderDesk(t); return; }
  wg.drawImage(bg, 0, 0); drawClouds(t);
  const items = [];
  for (const f of tufts) items.push({ y: f.y, d: () => drawTuft(f, t) });
  for (const f of flowers) if (!f.eaten) items.push({ y: f.y, d: () => drawFlower(f) });
  for (const d of herd) items.push({ y: d.y + 0.5, d: () => { deer = d; wg.globalAlpha = d.alpha ?? 1; drawDeer(t, d.P); wg.globalAlpha = 1; } });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.d();
  deer = herd[0];
  for (const f of butterflies) drawButterfly(f, t);
  drawParticles(particles);

  if (debugBox?.checked) drawDebug();
  if (mouse.inside) {
    if (mouse.down) drawMap(wg, MAPS.clover, mouse.x - 2, mouse.y - 5, { g: '#4f9a3a', s: '#3a7a2a' });
    drawMap(wg, MAPS.hand, mouse.x - 4, mouse.y, { '#': '#3b2317', w: '#f6dcc0' });
  }
}

// Desktop: every deer draws into her own small canvas that slides along the strip with her.
function renderDesk(t) {
  herd.forEach((d, i) => {
    const cv = i === 0 ? canvas : d.cv;
    wg = cv.getContext('2d'); deer = d;
    const ox = Math.round(clamp(d.x - cv.width / 2, 0, W - cv.width));
    if (ox !== d.ox) { d.ox = ox; cv.style.transform = `translateX(${ox * SCALE}px)`; }
    wg.setTransform(1, 0, 0, 1, -ox, 0);
    wg.clearRect(ox, 0, cv.width, H);
    const a = Math.round((d.alpha ?? 1) * 20) / 20;
    if (a !== d.shownAlpha) { d.shownAlpha = a; cv.style.opacity = a; }
    drawDeer(t, d.P);
    drawParticles(particles.filter(p => p.owner === d));
    // your real cursor is visible on the desktop; just show the clover while you're feeding her
    if (d.state === 'fed') drawMap(wg, MAPS.clover, mouse.x - 2, mouse.y - 5, { g: '#4f9a3a', s: '#3a7a2a' });
  });
  wg = canvas.getContext('2d'); deer = herd[0];
}

function drawParticles(list) {
  for (const p of list) {
    const a = Math.min(1, p.life * 2);
    wg.globalAlpha = a;
    if (p.type === 'heart') drawMap(wg, MAPS.heart, p.x - 2, p.y, { '#': '#e5484d' });
    else if (p.type === 'z') drawMap(wg, MAPS.z, p.x, p.y, { '#': '#fbf3e4' });
    else if (p.type === 'dust') { wg.fillStyle = '#d9cfae'; wg.fillRect(Math.round(p.x), Math.round(p.y), 2, 1); }
    else { wg.fillStyle = p.c; wg.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    wg.globalAlpha = 1;
  }
}

function drawDebug() {
  const b = bodyCenter(), h = headPos();
  const circle = (x, y, r, c) => { wg.strokeStyle = c; wg.lineWidth = 1; wg.beginPath(); wg.arc(x, y, r, 0, TAU); wg.stroke(); };
  circle(b.x, b.y, CURIOUS_DIST, 'rgba(255,255,255,.5)');
  circle(h.x, h.y, PET_DIST, 'rgba(229,72,77,.9)');
  wg.fillStyle = '#3b2317';
  wg.font = '6px monospace';
  wg.fillText(`cursor ${Math.round(mouse.speed)}px/s`, 4, H - 6);
}

// ─────────────────────────── UI ───────────────────────────
const autoBtn = document.getElementById('auto');
const stateEl = document.getElementById('state');
const trustEl = document.getElementById('trust');
const debugBox = document.getElementById('debug');
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}
function setAuto(v) {
  auto = v;
  if (autoBtn) autoBtn.textContent = 'AUTO MODE: ' + (v ? 'ON' : 'OFF');
  autoBtn?.classList.toggle('on', v);
  deer.target = null; deer.afterArrive = null;
  if (['walk', 'run', 'curious', 'fed', 'pet'].includes(deer.state)) setState('stand');
  deer.idleDur = rand(1.5, 3);
}
autoBtn?.addEventListener('click', e => { setAuto(!auto); e.currentTarget.blur(); });
document.getElementById('actions')?.addEventListener('click', e => {
  const a = e.target.closest('button')?.dataset.a; if (!a) return;
  doAction(a, false); e.target.blur();
});
document.getElementById('hide')?.addEventListener('click', e => {
  const p = document.getElementById('panel'); p.classList.toggle('min');
  e.currentTarget.textContent = p.classList.contains('min') ? '+' : '_'; e.currentTarget.blur();
});
debugBox?.addEventListener('change', e => e.target.blur());

// ─────────────────────────── Design Lab ───────────────────────────
const labEl = document.getElementById('lab');
const LAB_POSES = {
  side: ['stand', 1.0, {}],
  front: ['stare', 1.0, {}],
};
// which views each part's thumbnails show
const PART_VIEWS = { torso: ['side'], legs: ['side'], neck: ['side'], head: ['side'], face: ['front'], ears: ['side', 'front'], tail: ['side'] };
const PREVIEW = [
  ['stand', 1, {}], ['stare', 1, {}], ['walk', 1, { phase: 0.3 }], ['run', 1, { phase: 0.25 }],
  ['graze', 1.1, {}], ['rest', 1, { lie: 1 }], ['sleep', 5, { lie: 1, tuck: true }],
];
const CROP = { x: 6, y: 8, w: 84, h: DH - 8 };
function snapTo(canvas, x, [state, t, extra], sx = 3) {
  window.deerDebug.renderState(state, t, extra);
  const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(dc, CROP.x, CROP.y, CROP.w, CROP.h, x, 0, CROP.w * sx, CROP.h * sx);
}
function labCode() { return PARTS.map(([k, , ab]) => ab + (SEL[k] + 1)).join(' · '); }
function renderLab() {
  if (!labEl) return;
  document.getElementById('labCode').textContent = labCode();
  const pv = document.getElementById('labPreview'); pv.replaceChildren();
  for (const pose of PREVIEW) {
    const c = document.createElement('canvas'); c.width = CROP.w * 3; c.height = CROP.h * 3;
    snapTo(c, 0, pose); pv.appendChild(c);
  }
  const rows = document.getElementById('labRows'); rows.replaceChildren();
  for (const [k, name, ab] of PARTS) {
    const row = document.createElement('div'); row.className = 'labRow';
    const h3 = document.createElement('h3'), range = document.createElement('span');
    h3.textContent = name + ' ';
    range.textContent = `(${ab}1–${ab}10)`; range.style.opacity = '.6';
    h3.appendChild(range); row.appendChild(h3);
    const grid = document.createElement('div'); grid.className = 'labGrid';
    const keep = SEL[k], views = PART_VIEWS[k];
    for (let i = 0; i < 10; i++) {
      SEL[k] = i; buildConfig();
      const cell = document.createElement('button'); cell.className = 'labCell' + (i === keep ? ' sel' : '');
      const c = document.createElement('canvas'); c.width = CROP.w * 3 * views.length; c.height = CROP.h * 3;
      views.forEach((v, j) => snapTo(c, j * CROP.w * 3, LAB_POSES[v]));
      cell.appendChild(c);
      const num = document.createElement('b'); num.textContent = ab + (i + 1); cell.appendChild(num);
      cell.addEventListener('click', () => { SEL[k] = i; buildConfig(); saveSel(); renderLab(); });
      grid.appendChild(cell);
    }
    SEL[k] = keep; buildConfig();
    row.appendChild(grid); rows.appendChild(row);
  }
}
document.getElementById('labBtn')?.addEventListener('click', e => { labEl.classList.add('open'); renderLab(); e.currentTarget.blur(); });
document.getElementById('labClose')?.addEventListener('click', () => labEl.classList.remove('open'));
document.getElementById('labReset')?.addEventListener('click', () => { SEL = { ...DEFAULT_SEL }; buildConfig(); saveSel(); renderLab(); });
document.getElementById('labCopy')?.addEventListener('click', () => {
  navigator.clipboard?.writeText(labCode()).then(() => toast('Copied: ' + labCode()), () => toast(labCode()));
});
addEventListener('keydown', e => { if (e.key === 'Escape') labEl.classList.remove('open'); });

// ─────────────────────────── loop ───────────────────────────
addEventListener('resize', resize);
resize();

let last = performance.now(), T = 0, lastUi = '';
// On the desktop, drive the loop with a timer instead of requestAnimationFrame: rAF would wake us
// at the display's refresh rate (up to 144Hz) just to skip most frames. Pixel art doesn't need it:
// 24fps while something's moving, 12fps while idle, 8fps while everyone's asleep.
const ACTIVE = ['walk', 'run', 'play', 'jump', 'fed', 'pet', 'curious'];
function deskFps() {
  const watching = OPT.watch && !OPT.ignore && mouse.still < 1 && herd.some(d => TRACK_STATES.includes(d.state));
  const fading = herd.some(d => Math.abs((d.alpha ?? 1) - (d.hovered ? 0.2 : 1)) > 0.02);
  if (watching || fading || herd.some(d => ACTIVE.includes(d.state) || d.swat > 0)) return 24;
  if (herd.every(d => d.state === 'sleep' && d.lie >= 1)) return 8;
  return 12;
}
let paused = !!window.DEER_START_PAUSED;   // hosts pause the loop entirely while she's hidden
function scheduleFrame() {
  if (paused) return;
  if (DESK) setTimeout(() => frame(performance.now()), 1000 / deskFps());
  else requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  updateWorld(dt, T);
  for (const d of herd) {
    deer = d;
    updateDeer(dt);
    const P = smoothPose(poseFor(T), dt);
    P.lie = deer.lie >= 0.6 ? 1 : 0;
    renderDeer(P, T);
    const g = d.spr.getContext('2d'); g.clearRect(0, 0, DW, DH); g.drawImage(dc, 0, 0);
    d.P = P;
  }
  deer = herd[0];
  render(T);
  if (stateEl) {
    const ui = LABELS[deer.state] || deer.state;
    if (ui !== lastUi) { stateEl.textContent = ui; lastUi = ui; }
    trustEl.style.width = Math.round(deer.trust * 100) + '%';
  }
  scheduleFrame();
}
scheduleFrame();

if (EXT) {
  const moved = e => { mouse.cx = e.clientX; mouse.cy = e.clientY; mouse.inside = true; };
  addEventListener('mousemove', moved, { passive: true, capture: true });
  addEventListener('mousedown', e => { moved(e); mouse.down = true; }, { passive: true, capture: true });
  addEventListener('mouseup', () => { mouse.down = false; }, { passive: true, capture: true });
  addEventListener('mouseout', e => { if (!e.relatedTarget) mouse.inside = false; }, { passive: true });
  addEventListener('scroll', () => { deskOxReset(); }, { passive: true });
}
function deskOxReset() { for (const d of herd) d.ox = null; }

window.deerDesktop = {
  cursor(x, y, down) { mouse.cx = x; mouse.cy = y; mouse.inside = true; mouse.down = down; },
  setScale(s) { window.DEER_SCALE = s; resize(); },
  setOptions(o) {   // hosts (Mac menu, extension popup, prototype panel) flip these
    for (const key of Object.keys(OPT)) if (key in Object(o)) OPT[key] = !!o[key];
    setFriend(!!OPT.friend);
    syncOptionBoxes();
  },
  setPaused(p) {
    if (p === paused) return;
    paused = p;
    if (!p) { last = performance.now(); scheduleFrame(); }   // resume without a giant time step
  },
};
function syncOptionBoxes() {
  for (const k of ['ignore', 'watch', 'follow', 'friend', 'shy']) {
    const el = document.getElementById('opt-' + k); if (el) el.checked = !!OPT[k];
  }
}
for (const k of ['ignore', 'watch', 'follow', 'friend', 'shy']) {
  document.getElementById('opt-' + k)?.addEventListener('change', e => {
    window.deerDesktop.setOptions({ [k]: e.target.checked }); e.target.blur();
  });
}
setFriend(!!OPT.friend);
syncOptionBoxes();

// Dev hook for the console / Design Lab, e.g. window.deerDebug.renderState('graze', 1.2)
window.deerDebug = {
  get deer() { return herd[0]; }, herd, social, OPT, setAuto, doAction, sprite: dc, get auto() { return auto; }, openLab() { labEl.classList.add('open'); renderLab(); },
  // Render one pose synchronously (works even when rAF is paused): renderState('graze', 1.2, {lie: 1})
  renderState(state, t = 1, extra = {}) {
    const saved = { state: deer.state, st: deer.st, lie: deer.lie, z: deer.z, phase: deer.phase,
      ears: deer.ears, swat: deer.swat, tuck: deer.tuck, headMode: deer.headMode };
    Object.assign(deer, { state, st: t, lie: 0, ears: { n: 0, f: 0, tn: 0, tf: 0, cd: 9 }, swat: 0, headMode: 'fwd' }, extra);
    const P = poseFor(t); P.lie = deer.lie >= 0.6 ? 1 : 0;
    renderDeer(P, t);
    Object.assign(deer, saved);
    return dc;
  },
};
})();
