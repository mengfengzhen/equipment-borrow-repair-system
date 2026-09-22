export type DeviceDictionaryField = 'type' | 'brand' | 'model' | 'location';

export type DeviceDictionaryItem = {
  value: string;
  used: boolean;
  usageCount: number;
};

export type DeviceDictionaryGroup = {
  field: DeviceDictionaryField;
  label: string;
  items: DeviceDictionaryItem[];
};
