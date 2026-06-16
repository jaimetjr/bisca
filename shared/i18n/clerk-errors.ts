import { t } from './index';

type ClerkErrorLike = {
  errors?: { code?: string; message?: string; longMessage?: string }[];
  message?: string;
};

const CODE_MAP: Record<string, string> = {
  form_identifier_not_found: 'auth.errEmailNotFound',
  form_password_incorrect: 'auth.errPasswordIncorrect',
  form_identifier_exists: 'auth.errEmailExists',
  form_password_pwned: 'auth.errPasswordPwned',
  form_password_length_too_short: 'auth.errPasswordTooShort',
  form_password_size_in_bytes_exceeded: 'auth.errPasswordTooShort',
  form_code_incorrect: 'auth.errInvalidCode',
  verification_failed: 'auth.errInvalidCode',
  verification_invalid: 'auth.errInvalidCode',
  form_param_format_invalid: 'auth.errInvalidFormat',
  network_error: 'auth.errNetwork',
};

export function translateClerkError(err: unknown, fallbackKey: string): string {
  const e = err as ClerkErrorLike;
  const code = e?.errors?.[0]?.code;
  if (code && CODE_MAP[code]) return t(CODE_MAP[code]);
  return t(fallbackKey);
}
