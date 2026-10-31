export const BEXIO_MAPPING_GROUPS = [
  {
    collection: 'categories',
    title: 'Contact categories',
    fields: [
      {
        key: 'isArchived',
        label: 'Archived',
        hint: 'Categories for archived contacts.',
      },
      {
        key: 'isInactiveEndOfSeason',
        label: 'Inactive at season end',
        hint: 'Categories marking contacts who leave at the end of the season.',
      },
      {
        key: 'isAutoImported',
        label: 'Automatically imported',
        hint: 'Categories used for automatically imported contacts.',
      },
      {
        key: 'isInactive',
        label: 'Inactive',
        hint: 'Categories marking inactive contacts.',
      },
      {
        key: 'is1418Coach',
        label: '1418 coach',
        hint: 'General categories identifying 1418 coaches; team assignments remain in the application.',
      },
      {
        key: 'isTrainerChild',
        label: 'Trainer child',
        hint: 'Categories identifying children of trainers.',
      },
      {
        key: 'isTrainer',
        label: 'Trainer category',
        hint: 'Contact categories identifying trainers.',
      },
    ],
  },
  {
    collection: 'branches',
    title: 'Contact tags',
    fields: [
      {
        key: 'isAnonymized',
        label: 'Anonymized',
        hint: 'Tags identifying anonymized contacts.',
      },
      {
        key: 'isTrial',
        label: 'Trial',
        hint: 'Tags identifying trial participants.',
      },
      {
        key: 'isMustBill',
        label: 'Billing required',
        hint: 'Tags marking contacts who must be billed.',
      },
      {
        key: 'hasTest',
        label: 'Test',
        hint: 'Tags used to identify test contacts.',
      },
      {
        key: 'isAdmin',
        label: 'Administration',
        hint: 'Tags identifying the administrative role in club workflows.',
      },
      {
        key: 'isVorstand',
        label: 'Board',
        hint: 'Tags identifying board members.',
      },
      {
        key: 'hasReceivedClothes',
        label: 'Clothing received',
        hint: 'Tags marking members who have received their club clothing.',
      },
      {
        key: 'isTrainer',
        label: 'Trainer tag',
        hint: 'Tags identifying trainers.',
      },
      {
        key: 'isAthleticTrainer',
        label: 'Athletic trainer',
        hint: 'Tags identifying athletic trainers.',
      },
      {
        key: 'isGoalieTrainer',
        label: 'Goalkeeper trainer',
        hint: 'Tags identifying goalkeeper trainers.',
      },
      { key: 'isCoach', label: 'Coach', hint: 'Tags identifying coaches.' },
      {
        key: 'isCoTrainer',
        label: 'Co-trainer',
        hint: 'Tags identifying co-trainers.',
      },
    ],
  },
] as const;
export type CatalogCollection = 'categories' | 'branches';
export interface BexioCatalog {
  id: 'catalog';
  hash: string;
  items: ({ id: number; name: string } & Record<string, unknown>)[];
}
export function checkedBexioCatalog(value: unknown): BexioCatalog {
  const v = value as BexioCatalog;
  if (
    !v ||
    v.id !== 'catalog' ||
    typeof v.hash !== 'string' ||
    !v.hash ||
    !Array.isArray(v.items) ||
    v.items.length > 1000 ||
    v.items.some(
      (i) =>
        !i ||
        !Number.isSafeInteger(i.id) ||
        i.id <= 0 ||
        typeof i.name !== 'string',
    ) ||
    new Set(v.items.map((i) => i.id)).size !== v.items.length
  )
    throw Error('Bexio mappings are unavailable. Reload the catalogs.');
  return v;
}
export const mappingIds = (snapshot: BexioCatalog, flag: string) =>
  snapshot.items
    .filter((item) => item[flag] === true)
    .map((item) => item.id)
    .sort((a, b) => a - b);
