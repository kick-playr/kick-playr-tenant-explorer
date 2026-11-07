import { ClubBrandingSettings } from './club-branding-settings';
import { SettingsSectionFields } from './settings-section-fields';
import type { SettingsSectionProps } from './types';
export function AppearanceSettings(props: SettingsSectionProps) {
  return (
    <>
      <ClubBrandingSettings {...props} />
      <SettingsSectionFields {...props} groupId="appearance" />
    </>
  );
}
