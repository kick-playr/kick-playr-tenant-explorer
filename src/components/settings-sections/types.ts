export interface SettingsSectionProps {
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
  draft: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onChangeMany?: (changes: Record<string, string>) => void;
  snapshotJson: string;
}
