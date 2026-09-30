"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  readonly children: ReactNode;
  readonly pendingLabel: string;
};

export function PendingSubmitButton({
  children,
  className,
  disabled,
  name,
  pendingLabel,
  value,
  ...buttonProps
}: PendingSubmitButtonProps) {
  const status = useFormStatus();
  const submittedValue = name === undefined ? null : status.data?.get(name);
  const ownsPendingState =
    name === undefined ||
    value === undefined ||
    String(submittedValue) === String(value);
  const showPending = status.pending && ownsPendingState;

  return (
    <button
      {...buttonProps}
      aria-busy={showPending}
      className={[className, showPending ? "is-pending" : null]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled === true || status.pending}
      name={name}
      type="submit"
      value={value}
    >
      {showPending ? (
        <>
          <span aria-hidden="true" className="button-spinner" />
          <span aria-live="polite">{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
