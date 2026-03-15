/** Parse DD/MM/YYYY and return true if the person is at least 18 years old. */
export function isAtLeast18(dobString: string): boolean {
  const parts = dobString.split('/');
  if (parts.length !== 3) return false;
  const [day, month, year] = parts.map(Number);
  if (!day || !month || !year || year < 1900) return false;
  const dob = new Date(year, month - 1, day);
  if (isNaN(dob.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 18;
}

/** Convert DD/MM/YYYY to YYYY-MM-DD (ISO date string for the server). */
export function dobToISO(dobString: string): string {
  const [day, month, year] = dobString.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
