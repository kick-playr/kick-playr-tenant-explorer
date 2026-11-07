import { SettingsSectionFields } from './settings-section-fields';
import type { SettingsSectionProps } from './types';
export function PeopleShopsSettings(props: SettingsSectionProps) {
  return <SettingsSectionFields {...props} groupId="people" />;
}
