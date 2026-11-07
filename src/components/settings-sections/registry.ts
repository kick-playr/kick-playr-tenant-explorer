import { EmailContentSettings } from './email-content-settings';
import type { ComponentType } from 'react';
import type { SettingsSectionProps } from './types';
import { SeasonsMembershipSettings } from './seasons-membership-settings';
import { AppearanceSettings } from './appearance-settings';
import { PeopleShopsSettings } from './people-shops-settings';
import { BillingSettings } from './billing-settings';
import { TrialsVouchersSettings } from './trials-vouchers-settings';
import { ChatRoomsSettings } from './chat-rooms-settings';
import { AllSettingsSection } from './all-settings-section';
/** Add a section component here to extend the second-level settings menu. */
export const SETTINGS_SECTIONS: readonly {
  id: string;
  label: string;
  Component: ComponentType<SettingsSectionProps>;
}[] = [
  {
    id: 'seasons',
    label: 'Seasons & membership',
    Component: SeasonsMembershipSettings,
  },
  { id: 'appearance', label: 'Appearance', Component: AppearanceSettings },
  { id: 'people', label: 'People & shops', Component: PeopleShopsSettings },
  { id: 'billing', label: 'Billing', Component: BillingSettings },
  {
    id: 'trials',
    label: 'Trials & vouchers',
    Component: TrialsVouchersSettings,
  },
  { id: 'email', label: 'Email content', Component: EmailContentSettings },
  { id: 'chat', label: 'Chat rooms', Component: ChatRoomsSettings },
  { id: 'all', label: 'All settings', Component: AllSettingsSection },
];
