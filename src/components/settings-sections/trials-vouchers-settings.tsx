import { SettingsSectionFields } from './settings-section-fields';
import type { SettingsSectionProps } from './types';
export function TrialsVouchersSettings(props: SettingsSectionProps) {
  return <SettingsSectionFields {...props} groupId="trials" />;
}
