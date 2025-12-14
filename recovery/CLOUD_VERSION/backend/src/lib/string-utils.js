export const sanitizeString = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') {
    const str = String(value);
    return str.trim();
  }
  return value.trim();
};

export default {
  sanitizeString
};
