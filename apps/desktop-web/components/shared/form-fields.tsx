import type { SelectOption } from './config-utils';

export function ModeCard({ title, desc, active, onClick }: { title: string; desc: string; active: boolean; onClick: () => void }) {
  return <button className="mode-card" data-active={active ? 'true' : 'false'} type="button" onClick={onClick}><strong>{title}</strong><span>{desc}</span></button>;
}

export function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function SecretField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span><input type="password" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<string | SelectOption>; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const normalized = typeof option === 'string' ? { value: option, label: option } : option;
          return <option key={normalized.value} value={normalized.value}>{normalized.label}</option>;
        })}
      </select>
    </label>
  );
}

export function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle-field"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}
