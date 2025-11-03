import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// support __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Reads passages/iliad.txt, counts words, and writes words with counts
// >= 10 and < 100 to passages/iliad_dictionary.txt (one per line as "word\tcount").

const inputPath = path.join(__dirname, "iliad.txt");
const outPath = path.join(__dirname, "iliad_dictionary.txt");

if (!fs.existsSync(inputPath)) {
  console.error("Error: input file not found:", inputPath);
  process.exit(1);
}

const text = fs.readFileSync(inputPath, "utf8");

// Normalize: use Unicode letters, convert to lower case. Replace any non-letter
// characters with spaces so words are separated cleanly.
const normalized = text.toLowerCase().replace(/[^\p{L}]+/gu, " ");

const counts = Object.create(null);
for (const w of normalized.split(/\s+/)) {
  if (!w) continue;
  counts[w] = (counts[w] || 0) + 1;
}

const keys = Object.keys(counts).sort(
  (a, b) => counts[b] - counts[a] || a.localeCompare(b)
);

const selected = [];
for (let i = 0; i < keys.length; i++) {
  let word = keys[i];
  let count = counts[word];
  if (count >= 10) {
    selected.push({ word, count });
  }
}

const header = `# Dictionary generated from iliad.txt
# Words with counts >= 10 and < 100
# Total unique words matching: ${selected.length}
# Format: word\tcount
\n`;

const body = selected.map((e) => `${e.word}\t${e.count}`).join("\n");
fs.writeFileSync(outPath, header + body + "\n", "utf8");

console.log("Wrote", outPath, "with", selected.length, "entries");
