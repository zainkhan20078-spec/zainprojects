export interface Point {
  x: number;
  y: number;
}

export interface MousePathOptions {
  steps?: number;
  jitter?: number;
}

export function gaussianRandom(mean = 150, stdev = 45): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return Math.max(10, Math.round(mean + stdev * z));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function quadraticBezier(p0: Point, p1: Point, p2: Point, t: number): Point {
  const x = lerp(lerp(p0.x, p1.x, t), lerp(p1.x, p2.x, t), t);
  const y = lerp(lerp(p0.y, p1.y, t), lerp(p1.y, p2.y, t), t);
  return { x, y };
}

function jitter(value: number, amount: number): number {
  return value + (Math.random() * 2 - 1) * amount;
}

export function generateMousePath(from: Point, to: Point, options: MousePathOptions = {}): Point[] {
  const steps = options.steps ?? 24;
  const jitterAmount = options.jitter ?? 1.8;

  const control: Point = {
    x: (from.x + to.x) / 2 + (Math.random() * 40 - 20),
    y: (from.y + to.y) / 2 + (Math.random() * 40 - 20),
  };

  const points: Point[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const curve = quadraticBezier(from, control, to, t);
    points.push({
      x: jitter(curve.x, jitterAmount),
      y: jitter(curve.y, jitterAmount),
    });
  }

  points[points.length - 1] = to;
  return points;
}

export function randomTypingDelay(): number {
  return Math.min(250, Math.max(50, gaussianRandom(135, 48)));
}

export function shouldMakeTypingMistake(chance = 0.05): boolean {
  return Math.random() < chance;
}

export function typoForChar(char: string): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const lower = char.toLowerCase();
  if (!alphabet.includes(lower)) {
    return char;
  }

  const index = alphabet.indexOf(lower);
  const neighborIndex = Math.max(0, Math.min(alphabet.length - 1, index + (Math.random() < 0.5 ? -1 : 1)));
  const typo = alphabet[neighborIndex];
  return char === lower ? typo : typo.toUpperCase();
}

export function randomScrollStep(): number {
  const direction = Math.random() < 0.9 ? 1 : -1;
  const amount = Math.round(Math.random() * 420 + 80);
  return direction * amount;
}
