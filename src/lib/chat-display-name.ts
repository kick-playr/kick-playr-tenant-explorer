/** Display labels only; identifiers and stored Matrix names retain their stage. */
export function displayChatName(name: string): string {
  const clean = name.replace(
    /^(?:(?:local|development|dev|test|testing|preview|staging|stage|sandbox|qa|production|prod)_)+/i,
    '',
  );
  // Managed names are <stage>_<tenant>_<label>; root names have no label.
  // Leave unprefixed names intact and remove only one tenant segment.
  const label = (clean === name ? clean : clean.replace(/^[a-z0-9][a-z0-9-]*_(?=.+)/i, "")).replace(/_room$/i, "");
  return /^1418_Coaches$/i.test(label) ? "1418 Coaches" : label;
}
