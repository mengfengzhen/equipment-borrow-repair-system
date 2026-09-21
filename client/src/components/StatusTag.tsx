import { borrowStatusNames, deviceStatusNames, repairStatusNames, tagColors } from '../types/enums';

type Props = {
  value?: string;
  label?: string;
};

export function StatusTag({ value, label: labelOverride }: Props) {
  if (!value) return <span className="status-pill status-default"><span />未知</span>;
  const label = labelOverride || deviceStatusNames[value] || borrowStatusNames[value] || repairStatusNames[value] || value;
  return (
    <span className={`status-pill status-${tagColors[value] || 'default'}`}>
      <span />
      {label}
    </span>
  );
}
