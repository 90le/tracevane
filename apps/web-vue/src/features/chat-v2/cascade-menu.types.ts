export interface CascadeMenuItem {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  submenuOnly?: boolean;
  children?: CascadeMenuItem[];
}
