import { SettingsSectionFields } from './settings-section-fields';
import type { SettingsSectionProps } from './types';
export function ChatRoomsSettings(props: SettingsSectionProps) {
  return <SettingsSectionFields {...props} groupId="chat" />;
}
