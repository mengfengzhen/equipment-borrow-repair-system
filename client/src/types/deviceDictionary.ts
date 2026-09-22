export type DeviceDictionaryField = 'type' | 'brand' | 'typeBrand' | 'model' | 'location';

export type DeviceDictionaryItem = {
  value: string;
  type?: string;
  brand?: string;
  used: boolean;
  usageCount: number;
};

export type DeviceDictionaryGroup = {
  field: DeviceDictionaryField;
  label: string;
  items: DeviceDictionaryItem[];
};
