const ALPHANUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateJoinCode(length = 6): string {
  const chars: string[] = [];
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  for (let i = 0; i < length; i++) {
    chars.push(ALPHANUM[buf[i]! % ALPHANUM.length]!);
  }
  return chars.join("");
}
