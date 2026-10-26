import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId } from 'react';
import type { GradientStop } from '../core/types';

export function Control({
  label,
  value,
  children,
  hint,
}: {
  label: string;
  value?: ReactNode;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="control">
      <div className="control-label">
        <span>{label}</span>
        {value !== undefined && <span className="control-value">{value}</span>}
      </div>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
export function Range({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
}) {
  return (
    <Control label={label} value={`${Number(value.toFixed(3))}${unit}`} hint={hint}>
      <input
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Control>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  const hintId = useId();
  return (
    <label className="toggle-row">
      <span>
        {label}
        {hint && <small id={hintId}>{hint}</small>}
      </span>
      <input
        type="checkbox"
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
export function Section({
  title,
  children,
  badge,
  id,
}: {
  title: string;
  children: ReactNode;
  badge?: string;
  id?: string;
}) {
  return (
    <section id={id} className="inspector-section">
      <h3>
        {title}
        {badge && <span className="tiny-badge">{badge}</span>}
      </h3>
      {children}
    </section>
  );
}
export function GradientEditor({
  label,
  stops,
  onChange,
}: {
  label: string;
  stops: GradientStop[];
  onChange: (stops: GradientStop[]) => void;
}) {
  const addStop = () => {
    let index = 0;
    for (let i = 1; i < stops.length - 1; i++)
      if (stops[i + 1].at - stops[i].at > stops[index + 1].at - stops[index].at) index = i;
    const at = Number(((stops[index].at + stops[index + 1].at) / 2).toFixed(4));
    onChange([...stops, { at, color: stops[index].color }].sort((a, b) => a.at - b.at));
  };
  return (
    <Control label={label}>
      <div
        className="gradient-preview"
        style={{
          background: `linear-gradient(90deg, ${stops.map((s) => `${s.color} ${s.at * 100}%`).join(',')})`,
        }}
      />
      <div className="gradient-stops">
        {stops.map((stop, index) => (
          <div className="gradient-stop" key={index}>
            <input
              type="color"
              aria-label={`${label} Farbe ${index + 1}`}
              value={stop.color}
              onChange={(e) =>
                onChange(stops.map((s, i) => (i === index ? { ...s, color: e.target.value } : s)))
              }
            />
            <input
              aria-label={`${label} Position ${index + 1}`}
              type="number"
              min={index ? Math.floor(stops[index - 1].at * 100) + 1 : 0}
              max={index < stops.length - 1 ? Math.ceil(stops[index + 1].at * 100) - 1 : 100}
              step="1"
              disabled={index === 0 || index === stops.length - 1}
              value={Math.round(stop.at * 100)}
              onChange={(e) => {
                const at = Number(e.target.value) / 100;
                if (at > (stops[index - 1]?.at ?? -1) && at < (stops[index + 1]?.at ?? 2))
                  onChange(stops.map((s, i) => (i === index ? { ...s, at } : s)));
              }}
            />
            <span>%</span>
            {index > 0 && index < stops.length - 1 && (
              <button
                className="icon-button"
                aria-label={`${label} Farbe ${index + 1} entfernen`}
                onClick={() => onChange(stops.filter((_, i) => i !== index))}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {stops.length < 8 && (
        <button className="text-button" onClick={addStop}>
          <Plus size={12} /> Farbstopp
        </button>
      )}
    </Control>
  );
}
