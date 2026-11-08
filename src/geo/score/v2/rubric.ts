/** Versioned category budgets. The v1 rubric remains unchanged. */
export const GRID_VERSION = "v2.0.0" as const;

export const CATEGORY_WEIGHTS = {
  robots: 14,
  llms: 14,
  jsonld: 14,
  meta: 10,
  content: 18,
  brand: 10,
  discovery: 8,
  rendering: 12,
} as const;

export type V2Category = keyof typeof CATEGORY_WEIGHTS;
export type V2Profile = "general" | "saas" | "local" | "ecommerce" | "editeur";

export interface ControlDefinition {
  id: string;
  category: V2Category;
  title: string;
  definition: string;
  measurementMethod: string;
  expectedProof: string;
  maxPoints: number;
  successThreshold: number;
  fixType: string;
  effort: "S" | "M" | "L";
}

export interface ScoreGrid {
  version: string;
  profile: V2Profile;
  controls: readonly ControlDefinition[];
  /** Category allocations must sum to 100. */
  categoryWeights: Readonly<Record<V2Category, number>>;
}

export function validateGrid(grid: ScoreGrid): void {
  if (!/^v\d+\.\d+\.\d+$/.test(grid.version)) throw new Error("Invalid grid version");
  const categories = Object.keys(CATEGORY_WEIGHTS) as V2Category[];
  if (Object.keys(grid.categoryWeights).length !== categories.length ||
      categories.some((category) => !Number.isSafeInteger(grid.categoryWeights[category]) || grid.categoryWeights[category] < 0)) {
    throw new Error("Invalid category weights");
  }
  if (categories.reduce((total, category) => total + grid.categoryWeights[category], 0) !== 100) {
    throw new Error("Grid must allocate exactly 100 points");
  }
  const ids = new Set<string>();
  const allocations = Object.fromEntries(categories.map((category) => [category, 0])) as Record<V2Category, number>;
  for (const control of grid.controls) {
    if (!control.id || ids.has(control.id)) throw new Error(`Duplicate or empty control id: ${control.id}`);
    ids.add(control.id);
    if (!categories.includes(control.category)) throw new Error(`Invalid category: ${control.category}`);
    if (!Number.isSafeInteger(control.maxPoints) || control.maxPoints <= 0 ||
        !Number.isFinite(control.successThreshold) || control.successThreshold < 0 || control.successThreshold > 1) {
      throw new Error(`Invalid points or threshold: ${control.id}`);
    }
    if (!control.title || !control.definition || !control.measurementMethod || !control.expectedProof || !control.fixType) {
      throw new Error(`Incomplete control: ${control.id}`);
    }
    allocations[control.category] += control.maxPoints;
  }
  for (const category of categories) {
    if (allocations[category] !== grid.categoryWeights[category]) {
      throw new Error(`Control allocation mismatch: ${category}`);
    }
  }
}
