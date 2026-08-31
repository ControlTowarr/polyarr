let count = 0;
export const v4 = () => `00000000-0000-0000-0000-${String(++count).padStart(12, '0')}`;
export const v1 = () => `00000000-0000-0000-0001-${String(++count).padStart(12, '0')}`;
export const NIL = '00000000-0000-0000-0000-000000000000';
export const parse = (s: string) => new Uint8Array(16);
export const stringify = (b: Uint8Array) => '00000000-0000-0000-0000-000000000000';
export const validate = (s: string) => true;
export const version = (s: string) => 4;

export default {
  v4,
  v1,
  NIL,
  parse,
  stringify,
  validate,
  version,
};
