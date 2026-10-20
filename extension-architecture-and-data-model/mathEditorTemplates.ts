import {
  createAtomNode,
  createDerivativeNode,
  createEquationBlock,
  createFractionNode,
  createGroupNode,
  createIntegralNode,
  createLimitNode,
  createPowerNode,
  createRootNode,
  createSubscriptNode,
  createVectorNode,
  type EquationBlock,
  type MathNode,
} from "./MathAST";
import type { ManualAction } from "./ManualToolbar";

export interface EquationTemplate {
  id: string;
  label: string;
  description: string;
  topic: string;
}

export const BASE_MATH_ACTIONS: ManualAction[] = [
  { id: "frac", label: "Fraction", icon: "a/b", hint: "Insert \\frac" },
  { id: "power", label: "Power", icon: "xⁿ", hint: "Insert an exponent" },
  { id: "root", label: "Square root", icon: "√", hint: "Insert a square root" },
  { id: "subscript", label: "Subscript", icon: "xₙ", hint: "Insert a subscript" },
  { id: "group", label: "Parentheses", icon: "( )", hint: "Insert grouped expression" },
  { id: "vec", label: "Vector", icon: "v⃗", hint: "Insert a vector" },
  { id: "der", label: "Derivative", icon: "d/dx", hint: "Insert \\der" },
  { id: "lim", label: "Limit", icon: "lim", hint: "Insert \\lim" },
  { id: "integral", label: "Integral", icon: "∫", hint: "Insert a definite integral" },
];

export const MATH_TEMPLATES: EquationTemplate[] = [
  { id: "quadratic", topic: "Algebra", label: "Quadratic equation", description: "ax² + bx + c = 0" },
  { id: "quadratic-formula", topic: "Algebra", label: "Quadratic formula", description: "Solve ax² + bx + c = 0" },
  { id: "matrix-2x2", topic: "Algebra", label: "2×2 matrix", description: "A = [a  b; c  d]" },
  { id: "determinant-2x2", topic: "Algebra", label: "2×2 determinant", description: "|a  b; c  d|" },
  { id: "determinant-3x3", topic: "Algebra", label: "3×3 determinant", description: "Sarrus / cofactor layout" },
  { id: "matrix-inverse", topic: "Algebra", label: "2×2 inverse", description: "A⁻¹ = (1/det A) adj(A)" },
  { id: "system", topic: "Algebra", label: "Linear system", description: "Two equations in x and y" },
  { id: "limit", topic: "Calculus", label: "Limit", description: "lim x→a f(x)" },
  { id: "derivative", topic: "Calculus", label: "Derivative", description: "d/dx f(x)" },
  { id: "integral", topic: "Calculus", label: "Definite integral", description: "∫ from a to b" },
  { id: "tangent", topic: "Calculus", label: "Tangent line", description: "y − f(a) = f′(a)(x − a)" },
  { id: "function", topic: "Functions", label: "Quadratic function", description: "f(x) = ax² + bx + c" },
  { id: "trig-identity", topic: "Trigonometry", label: "Trig identity", description: "sin²θ + cos²θ = 1" },
  { id: "line-3d", topic: "Analytic geometry", label: "Line in 3D", description: "Point + direction vector" },
  { id: "plane-3d", topic: "Analytic geometry", label: "Plane in 3D", description: "Ax + By + Cz + D = 0" },
  { id: "bayes", topic: "Probability", label: "Bayes' theorem", description: "P(A|B) = P(B|A)P(A)/P(B)" },
  { id: "normal", topic: "Probability", label: "Normal distribution", description: "Standardise with z = (x − μ)/σ" },
  { id: "binomial", topic: "Probability", label: "Binomial probability", description: "P(X = k) = C(n,k)pᵏ(1−p)ⁿ⁻ᵏ" },
];

export const PHYSICS_TEMPLATES: EquationTemplate[] = [
  { id: "suvat", topic: "Mechanics", label: "SUVAT equations", description: "Constant-acceleration motion" },
  { id: "newton", topic: "Mechanics", label: "Newton's 2nd law", description: "F = ma" },
  { id: "weight", topic: "Mechanics", label: "Weight", description: "W = mg" },
  { id: "momentum", topic: "Mechanics", label: "Momentum", description: "p = mv" },
  { id: "kinetic-energy", topic: "Mechanics", label: "Kinetic energy", description: "Eₖ = ½mv²" },
  { id: "work", topic: "Mechanics", label: "Work", description: "W = Fs cos θ" },
  { id: "circular-motion", topic: "Mechanics", label: "Circular motion", description: "aᶜ = v²/r" },
  { id: "gravitation", topic: "Fields", label: "Gravitational force", description: "F = Gm₁m₂/r²" },
  { id: "electric-field", topic: "Fields", label: "Electric field", description: "E = F/q" },
  { id: "coulomb", topic: "Fields", label: "Coulomb's law", description: "F = kq₁q₂/r²" },
  { id: "electric-potential", topic: "Fields", label: "Electric potential", description: "V = Eₚ/q" },
  { id: "magnetic-force", topic: "Electromagnetism", label: "Magnetic force", description: "F = BIL sin θ" },
  { id: "faraday", topic: "Electromagnetism", label: "Faraday's law", description: "ε = −N ΔΦ/Δt" },
  { id: "ohm", topic: "Circuits", label: "Ohm's law", description: "V = IR" },
  { id: "electric-power", topic: "Circuits", label: "Electric power", description: "P = VI" },
  { id: "wave-speed", topic: "Waves", label: "Wave speed", description: "v = fλ" },
  { id: "photon-energy", topic: "Modern physics", label: "Photon energy", description: "E = hf" },
  { id: "de-broglie", topic: "Modern physics", label: "de Broglie wavelength", description: "λ = h/p" },
  { id: "thin-lens", topic: "Waves and optics", label: "Thin lens", description: "1/f = 1/do + 1/di" },
  { id: "snell", topic: "Waves and optics", label: "Snell's law", description: "n₁ sin θ₁ = n₂ sin θ₂" },
  { id: "photoelectric", topic: "Modern physics", label: "Photoelectric effect", description: "hf = W₀ + Eₖ,max" },
];

export const PHYSICS_ACTIONS: ManualAction[] = [
  { id: "frac", label: "Fraction", icon: "a/b", hint: "Insert a fraction" },
  { id: "power", label: "Power", icon: "xⁿ", hint: "Insert a power" },
  { id: "root", label: "Square root", icon: "√", hint: "Insert a square root" },
  { id: "subscript", label: "Subscript", icon: "xₙ", hint: "Insert a subscript" },
  { id: "group", label: "Parentheses", icon: "( )", hint: "Insert grouped expression" },
  { id: "vec", label: "Vector", icon: "v⃗", hint: "Insert a vector" },
  { id: "integral", label: "Integral", icon: "∫", hint: "Insert a definite integral" },
  { id: "unit-ms", label: "m/s", icon: "m/s", hint: "Insert metres per second" },
  { id: "unit-ms2", label: "m/s²", icon: "m/s²", hint: "Insert metres per second squared" },
  { id: "unit-newton", label: "N", icon: "N", hint: "Insert newtons" },
  { id: "unit-joule", label: "J", icon: "J", hint: "Insert joules" },
  { id: "unit-watt", label: "W", icon: "W", hint: "Insert watts" },
  { id: "unit-volt", label: "V", icon: "V", hint: "Insert volts" },
  { id: "unit-amp", label: "A", icon: "A", hint: "Insert amperes" },
  { id: "unit-ohm", label: "Ω", icon: "Ω", hint: "Insert ohms" },
  { id: "unit-coulomb", label: "C", icon: "C", hint: "Insert coulombs" },
  { id: "unit-kelvin", label: "K", icon: "K", hint: "Insert kelvin" },
  { id: "unit-hertz", label: "Hz", icon: "Hz", hint: "Insert hertz" },
  { id: "unit-tesla", label: "T", icon: "T", hint: "Insert tesla" },
  { id: "unit-weber", label: "Wb", icon: "Wb", hint: "Insert weber" },
  { id: "unit-kilogram", label: "kg", icon: "kg", hint: "Insert kilogram" },
  { id: "unit-second", label: "s", icon: "s", hint: "Insert second" },
  { id: "unit-metre", label: "m", icon: "m", hint: "Insert metre" },
  { id: "unit-pascal", label: "Pa", icon: "Pa", hint: "Insert pascal" },
  { id: "unit-farad", label: "F", icon: "F", hint: "Insert farad" },
  { id: "unit-henry", label: "H", icon: "H", hint: "Insert henry" },
  { id: "symbol-delta", label: "Δ", icon: "Δ", hint: "Insert change/difference symbol" },
  { id: "symbol-theta", label: "θ", icon: "θ", hint: "Insert angle symbol" },
  { id: "symbol-g", label: "g", icon: "g", hint: "Insert gravitational field strength symbol" },
  { id: "symbol-G", label: "G", icon: "G", hint: "Insert gravitational constant symbol" },
  { id: "symbol-k", label: "k", icon: "k", hint: "Insert Coulomb constant symbol" },
  { id: "symbol-h", label: "h", icon: "h", hint: "Insert Planck constant symbol" },
  { id: "symbol-c", label: "c", icon: "c", hint: "Insert speed of light symbol" },
];

const UNIT_TOKENS: Record<string, string> = {
  "unit-ms": " m·s⁻¹",
  "unit-ms2": " m·s⁻²",
  "unit-newton": " N",
  "unit-joule": " J",
  "unit-watt": " W",
  "unit-volt": " V",
  "unit-amp": " A",
  "unit-ohm": " Ω",
  "unit-coulomb": " C",
  "unit-kelvin": " K",
  "unit-hertz": " Hz",
  "unit-tesla": " T",
  "unit-weber": " Wb",
  "unit-kilogram": " kg",
  "unit-second": " s",
  "unit-metre": " m",
  "unit-pascal": " Pa",
  "unit-farad": " F",
  "unit-henry": " H",
  "symbol-delta": " Δ",
  "symbol-theta": " θ",
};

const SYMBOL_TOKENS: Record<string, string> = {
  "symbol-delta": "Δ",
  "symbol-theta": "θ",
  "symbol-g": "g",
  "symbol-G": "G",
  "symbol-k": "k",
  "symbol-h": "h",
  "symbol-c": "c",
};

export function getTokenForActionId(actionId: string): string | null {
  return UNIT_TOKENS[actionId] ?? SYMBOL_TOKENS[actionId] ?? null;
}

const NODE_FACTORIES: Record<string, () => MathNode> = {
  frac: createFractionNode,
  power: createPowerNode,
  root: createRootNode,
  subscript: createSubscriptNode,
  group: createGroupNode,
  der: createDerivativeNode,
  vec: createVectorNode,
  lim: createLimitNode,
  integral: createIntegralNode,
};

export function createNodeForActionId(actionId: string): MathNode | null {
  const factory = NODE_FACTORIES[actionId];
  return factory ? factory() : null;
}

function equation(...parts: Array<string | MathNode>): EquationBlock {
  return createEquationBlock(parts.map((part) => (typeof part === "string" ? createAtomNode(part) : part)));
}

export function createTemplateBlocks(templateId: string): EquationBlock[] {
  switch (templateId) {
    case "quadratic": {
      const power = createPowerNode();
      power.base.text = "x";
      power.exponent.text = "2";
      return [equation("a·", power, " + bx + c = 0")];
    }
    case "quadratic-formula": {
      const formula = createFractionNode();
      formula.numerator.text = "−b ± √(b² − 4ac)";
      formula.denominator.text = "2a";
      return [equation("x = ", formula)];
    }
    case "function": {
      const power = createPowerNode();
      power.base.text = "x";
      power.exponent.text = "2";
      return [equation("f(x) = ax", power, " + bx + c")];
    }
    case "trig-identity":
      return [equation("sin²θ + cos²θ = 1")];
    case "matrix-2x2":
      return [equation("A = [a  b; c  d]")];
    case "determinant-2x2":
      return [equation("|A| = ad − bc")];
    case "determinant-3x3":
      return [equation("|a b c; d e f; g h i|")];
    case "matrix-inverse":
      return [equation("A⁻¹ = (1/(ad − bc)) [d −b; −c a]")];
    case "system":
      return [equation("ax + by = c"), equation("dx + ey = f")];
    case "limit": {
      const limit = createLimitNode();
      limit.approach.text = "x→a";
      limit.expression.text = "f(x)";
      return [equation("lim ", limit)];
    }
    case "tangent":
      return [equation("y − f(a) = f′(a)(x − a)")];
    case "line-3d":
      return [equation("(x, y, z) = (x₀, y₀, z₀) + t(a, b, c)")];
    case "plane-3d":
      return [equation("Ax + By + Cz + D = 0")];
    case "bayes": {
      const formula = createFractionNode();
      formula.numerator.text = "P(B|A)P(A)";
      formula.denominator.text = "P(B)";
      return [equation("P(A|B) = ", formula)];
    }
    case "normal":
      return [equation("z = (x − μ)/σ")];
    case "binomial":
      return [equation("P(X = k) = C(n,k)pᵏ(1 − p)ⁿ⁻ᵏ")];
    case "derivative": {
      const derivative = createDerivativeNode();
      derivative.expression.text = "f(x)";
      derivative.variable.text = "x";
      return [equation("f′(x) = ", derivative)];
    }
    case "integral":
      return [equation(createIntegralNode())];
    case "suvat": {
      const v2 = createPowerNode();
      v2.base.text = "v";
      v2.exponent.text = "2";
      const u2 = createPowerNode();
      u2.base.text = "u";
      u2.exponent.text = "2";
      const t2 = createPowerNode();
      t2.base.text = "t";
      t2.exponent.text = "2";
      return [equation("v = u + at"), equation("s = ut + ½a", t2), equation(v2, " = ", u2, " + 2as")];
    }
    case "newton":
      return [equation("F = ma")];
    case "weight":
      return [equation("W = mg")];
    case "momentum":
      return [equation("p = mv")];
    case "kinetic-energy": {
      const velocitySquared = createPowerNode();
      velocitySquared.base.text = "v";
      velocitySquared.exponent.text = "2";
      return [equation("Eₖ = ½m", velocitySquared)];
    }
    case "work":
      return [equation("W = Fs cos θ")];
    case "ohm":
      return [equation("V = IR")];
    case "electric-power":
      return [equation("P = VI")];
    case "wave-speed":
      return [equation("v = fλ")];
    case "coulomb": {
      const inverseSquare = createFractionNode();
      inverseSquare.numerator.text = "kq₁q₂";
      inverseSquare.denominator.text = "r²";
      return [equation("F = ", inverseSquare)];
    }
    case "circular-motion":
      return [equation("aᶜ = v²/r")];
    case "gravitation": {
      const inverseSquare = createFractionNode();
      inverseSquare.numerator.text = "Gm₁m₂";
      inverseSquare.denominator.text = "r²";
      return [equation("F = ", inverseSquare)];
    }
    case "electric-field":
      return [equation("E = F/q")];
    case "electric-potential":
      return [equation("V = Eₚ/q")];
    case "magnetic-force":
      return [equation("F = BIL sin θ")];
    case "faraday":
      return [equation("ε = −N ΔΦ/Δt")];
    case "photon-energy":
      return [equation("E = hf")];
    case "de-broglie":
      return [equation("λ = h/p")];
    case "thin-lens":
      return [equation("1/f = 1/dₒ + 1/dᵢ")];
    case "snell":
      return [equation("n₁ sin θ₁ = n₂ sin θ₂")];
    case "photoelectric":
      return [equation("hf = W₀ + Eₖ,max")];
    default:
      return [];
  }
}
