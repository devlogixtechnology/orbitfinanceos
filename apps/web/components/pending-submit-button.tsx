"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
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
  onClick,
  pendingLabel,
  value,
  ...buttonProps
}: PendingSubmitButtonProps) {
  const status = useFormStatus();
  const [isActivating, setIsActivating] = useState(false);
  const submittedValue = name === undefined ? null : status.data?.get(name);
  const ownsPendingState =
    name === undefined ||
    value === undefined ||
    String(submittedValue) === String(value);
  const showPending = status.pending && ownsPendingState;
  const showFeedback = showPending || isActivating;

  useEffect(() => {
    if (showPending) return;
    if (!isActivating) return;
    const timeout = window.setTimeout(() => setIsActivating(false), 900);
    return () => window.clearTimeout(timeout);
  }, [isActivating, showPending]);

  return (
    <button
      {...buttonProps}
      aria-busy={showFeedback}
      className={[className, showFeedback ? "is-pending" : null]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled === true || status.pending}
      name={name}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && event.currentTarget.form?.checkValidity() !== false) {
          setIsActivating(true);
        }
      }}
      type="submit"
      value={value}
    >
      {showFeedback ? (
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
