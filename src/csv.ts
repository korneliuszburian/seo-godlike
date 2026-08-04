export function parseCsvRows(input: string, label: string): string[][] {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.map((line, lineIndex) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]!;
      if (character === '"') {
        if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
        else quoted = !quoted;
      } else if (character === "," && !quoted) {
        cells.push(cell); cell = "";
      } else cell += character;
    }
    if (quoted) throw new Error(`${label} line ${lineIndex + 1} has an unterminated quoted field`);
    cells.push(cell);
    return cells;
  });
}

export function csvHeaderIndex(rows: string[][], label: string): Map<string, number> {
  const headers = rows[0]?.map((header) => header.trim()) ?? [];
  const index = new Map<string, number>();
  headers.forEach((header, position) => {
    if (!header || index.has(header)) throw new Error(`${label} has duplicate or empty header '${header}'`);
    index.set(header, position);
  });
  return index;
}
