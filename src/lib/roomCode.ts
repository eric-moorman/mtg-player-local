const WORDS = [
  "FOX", "WREN", "ELK", "OAK", "MOSS", "REED", "PINE", "HARE",
  "CROW", "LYNX", "FERN", "DUNE", "COVE", "PEAK", "GLEN", "ASH",
];

export function generateRoomCode(): string {
  const a = WORDS[Math.floor(Math.random() * WORDS.length)];
  const b = WORDS[Math.floor(Math.random() * WORDS.length)];
  const n = Math.floor(10 + Math.random() * 90);
  return `${a}-${n}-${b}`;
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "-");
}

export function roomCodeToPeerId(code: string): string {
  return `kitchentable-${normalizeRoomCode(code)}`;
}
