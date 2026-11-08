/** Display labels only; identifiers and stored Matrix names retain their stage. */
export function displayChatName(name: string): string {
  return name.replace(
    /^(?:(?:local|development|dev|test|testing|preview|staging|stage|sandbox|qa|production|prod)_)+/i,
    '',
  );
}
