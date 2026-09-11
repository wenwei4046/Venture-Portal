"use client";

import s from "./QuantityStepper.module.css";

type QuantityStepperProps = {
  value: number;
  min: number;
  max: number;
  label: string;
  disabled?: boolean;
  onChange: (value: number) => void;
};

export default function QuantityStepper({
  value,
  min,
  max,
  label,
  disabled = false,
  onChange,
}: QuantityStepperProps) {
  return (
    <div
      className={s.stepper}
      role="group"
      aria-label={`${label} quantity`}
      aria-disabled={disabled || undefined}
      data-no-swipe
    >
      <button
        type="button"
        className={s.button}
        aria-label={`Decrease ${label} quantity`}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, Math.min(max, value - 1)))}
      >
        <span aria-hidden="true">−</span>
      </button>
      <output className={s.count} aria-label="Quantity" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className={s.button}
        aria-label={`Increase ${label} quantity`}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.max(min, Math.min(max, value + 1)))}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
