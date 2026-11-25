export interface FormState {
  /** A message for the whole form, shown in an alert. */
  error?: string;
  /** A success message, e.g. "Check your inbox". */
  message?: string;
  /** Per-field messages keyed by input name. */
  fields?: Record<string, string>;
}

export const initialFormState: FormState = {};
