export interface TeamItem {
  id: number;
  name: string;
  isTeam?: boolean;
  saison?: string[];
  previousCategoryIds?: number[];
}
export interface TeamCatalog {
  id: 'catalog';
  hash: string;
  items: TeamItem[];
}
export interface TeamOperation {
  operationKey: string;
  name: string;
  state: 'pending' | 'unknown' | 'link-pending' | 'complete';
  categoryId?: number;
  message?: string;
}
export interface TeamInventory {
  catalog: TeamCatalog;
  operations: TeamOperation[];
}
export interface TeamCommandResult {
  operation: TeamOperation;
  catalog?: TeamCatalog;
}
export interface TeamReadiness {
  checkedAt: string;
  items: {
    id: number;
    name: string;
    upstreamName?: string;
    status: 'verified' | 'name-differs' | 'missing' | 'unavailable';
  }[];
}
export const operationKey = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function checkedTeamCatalog(value: unknown): TeamCatalog {
  const v = value as TeamCatalog;
  if (
    !v ||
    v.id !== 'catalog' ||
    typeof v.hash !== 'string' ||
    !v.hash ||
    v.hash.length > 128 ||
    !Array.isArray(v.items) ||
    v.items.length > 1000
  )
    throw Error('Team configuration is unavailable. Reload before saving.');
  const ids = new Set<number>();
  for (const t of v.items) {
    if (
      !Number.isSafeInteger(t.id) ||
      t.id < 1 ||
      ids.has(t.id) ||
      typeof t.name !== 'string' ||
      !t.name.trim() ||
      (t.saison !== undefined &&
        (!Array.isArray(t.saison) ||
          t.saison.some(
            (s) => typeof s !== 'string' || !/^\d{2}(?:\d{2})?\.[12]$/.test(s),
          )))
    )
      throw Error('Team configuration is unavailable. Reload before saving.');
    ids.add(t.id);
  }
  return v;
}
export function checkedTeamOperation(value: unknown): TeamOperation {
  const v = value as TeamOperation;
  if (
    !v ||
    !operationKey(v.operationKey) ||
    typeof v.name !== 'string' ||
    !v.name.trim() ||
    !['pending', 'unknown', 'link-pending', 'complete'].includes(v.state) ||
    (v.categoryId !== undefined &&
      (!Number.isSafeInteger(v.categoryId) || v.categoryId < 1))
  )
    throw Error('Creation status is unavailable. Check again before retrying.');
  return v;
}
export function checkedTeamInventory(value: unknown): TeamInventory {
  const v = value as TeamInventory;
  const catalog = checkedTeamCatalog(v?.catalog);
  if (!Array.isArray(v.operations) || v.operations.length > 1000)
    throw Error('Creation status is unavailable.');
  return { catalog, operations: v.operations.map(checkedTeamOperation) };
}
