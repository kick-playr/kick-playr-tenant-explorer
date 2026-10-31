import { BexioTagMappings } from './bexio-tag-mappings';
import type { IntegrationSectionProps } from './types';
export function BexioLabelsSection(props: IntegrationSectionProps) {
  return (
    <BexioTagMappings
      key={props.path}
      path={props.path}
      request={props.request}
      active={props.active}
      busy={props.busy}
      onBusyChange={props.onBusyChange}
      onDirtyChange={props.onDirtyChange}
    />
  );
}
