import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Ollama } from "ollama";

// Oracle that generates short "predictions" using only words
// present in passages/iliad_dictionary.txt (format: word\tcount, comments with #)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DICT_PATH = path.join(
  __dirname,
  "..",
  "passages",
  "iliad_dictionary.txt"
);

// Ollama client defaults (match translator.js)
const DEFAULT_MODEL = "llama3.2:3b";
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_HOST = "http://127.0.0.1:11434";
const ollamaClient = new Ollama({ host: DEFAULT_HOST });

// Developer-editable persona/instruction fragment. Edit this in the code to
// change the Oracle's persona or style. This is NOT exposed in the UI.
// Keep it short (one or two sentences) to avoid very large prompts.
const CUSTOM_PROMPT_TEMPLATE = `You are a Homeric oracle: terse, ominous, and poetic. Speak in elevated phrases that feel prophetic. Answer questions with statements, and use the proper pronouns. For example, if the question uses "I", respond using "you".`;

let words = [];
let counts = [];
let allowedSet = null;

async function loadDictionary() {
  try {
    const raw = await fs.readFile(DICT_PATH, "utf-8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      if (line.trim().startsWith("#")) continue;
      const parts = line.split(/\t+/);
      if (parts.length >= 2) {
        const w = parts[0].trim();
        const c = parseInt(parts[1].trim(), 10) || 1;
        if (w) {
          words.push(w);
          counts.push(c);
        }
      }
    }
    if (words.length === 0) {
      console.warn("Oracle: dictionary loaded but no words found.");
    } else {
      allowedSet = new Set(words);
    }
  } catch (err) {
    console.error("Oracle: failed to read dictionary:", DICT_PATH, err.message);
  }
}

// Initialize at module load
await loadDictionary();

function normalizeText(s) {
  if (!s) return "";
  // lowercase and replace non-letters with spaces (Unicode aware)
  return s
    .toString()
    .toLowerCase()
    .replace(/[^\p{L}]+/gu, " ")
    .trim();
}

function tokenize(s) {
  const t = normalizeText(s);
  if (!t) return [];
  return t.split(/\s+/).filter(Boolean);
}

function cumulativeFromArray(arr) {
  const cum = new Array(arr.length);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    s += arr[i];
    cum[i] = s;
  }
  return { cum, total: s };
}

function sampleIndexFromCum(cumArr, total) {
  const r = Math.random() * total;
  // binary search for first cum > r
  let lo = 0;
  let hi = cumArr.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (cumArr[mid] > r) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function capitalizeSentence(s) {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1) + ".";
}

async function predict(prompt = "", opts = {}) {
  // opts: { length, size:'short'|'long', mode: 'sample'|'mostLikely'|'llm', temperature, model }
  const size = opts.size || "short";
  const mode = opts.mode || "llm"; // default to LLM-driven
  // map size to a default word-length for local sampling if length not provided
  const defaultLength = size === "long" ? 140 : 12;
  const length =
    typeof opts.length !== "undefined"
      ? Math.max(1, parseInt(opts.length || 12, 10))
      : defaultLength;
  const temperature =
    typeof opts.temperature === "number"
      ? opts.temperature
      : DEFAULT_TEMPERATURE;
  const model = opts.model || DEFAULT_MODEL;

  if (!words || words.length === 0) {
    throw new Error("Oracle: dictionary not loaded or empty");
  }
  // Tokenize prompt and build a merged allowed set that includes prompt words
  const promptTokens = tokenize(prompt);
  const promptUnique = Array.from(new Set(promptTokens));
  // mergedAllowedSet = iliad words + any words that appear in the prompt
  const mergedAllowedSet = new Set([...(allowedSet || []), ...promptUnique]);
  // mergedAllowedList: keep prompt words first so LLM sees them prominently
  const mergedAllowedList = [
    ...promptUnique,
    ...words.filter((w) => !promptUnique.includes(w)),
  ];

  // Local deterministic/sample modes (fallbacks)
  if (mode === "mostLikely" || mode === "sample") {
    const tokens = [];
    // Seed with first prompt token (whether in dictionary or not) so user's words are allowed
    let seed = null;
    for (const t of promptUnique) {
      if (t) {
        seed = t;
        break;
      }
    }
    if (seed) tokens.push(seed);

    if (mode === "mostLikely") {
      // Start with prompt words (preserve order) then highest-count dictionary words
      for (const p of promptUnique) {
        if (p && !tokens.includes(p)) tokens.push(p);
      }
      const idxs = counts
        .map((c, i) => i)
        .sort((a, b) => counts[b] - counts[a]);
      for (let i = 0; tokens.length < length && i < idxs.length; i++) {
        const w = words[idxs[i]];
        if (!tokens.includes(w)) tokens.push(w);
      }
      return { text: capitalizeSentence(tokens.join(" ")), tokens };
    }

    // sample
    const tempExp = 1 / Math.max(1e-8, temperature);
    const modWeights = counts.map((c) => Math.pow(c, tempExp));
    // If seed is a prompt-only word (not in dictionary) we keep it as initial token and
    // do not attempt to zero out any index; if it exists in dictionary, zero it to avoid repeat
    if (seed) {
      const seedIdx = words.indexOf(seed);
      if (seedIdx >= 0) modWeights[seedIdx] = 0;
    }
    // Prepend any prompt-unique tokens to ensure user's words appear
    for (const p of promptUnique) {
      if (p && !tokens.includes(p)) tokens.push(p);
    }
    for (let i = tokens.length; tokens.length < length; i++) {
      const { cum, total } = cumulativeFromArray(modWeights);
      if (total <= 0) break;
      const idx = sampleIndexFromCum(cum, total);
      const w = words[idx];
      tokens.push(w);
      modWeights[idx] = 0;
    }
    return { text: capitalizeSentence(tokens.join(" ")), tokens };
  }

  // LLM-driven mode: instruct Ollama to produce a sentence using ONLY allowed words
  // mergedAllowedList includes prompt words followed by iliad dictionary words
  const allowedListStr = mergedAllowedList.join(" ");
  const seedTokens = promptUnique.filter((t) => t && mergedAllowedSet.has(t));
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let llmPrompt = `You are the Oracle. Compose a short, coherent prediction of the future using ONLY the allowed vocabulary listed below.\n\n`;
    llmPrompt += `Rules:\n`;
    llmPrompt += `- Use ONLY words from the allowed list. Do not use any other words, punctuation, or symbols.\n`;
    // Enforce exactly one sentence for LLM-driven responses per user's preference
    llmPrompt += `- Produce exactly one concise, coherent sentence. Do not produce multiple sentences or paragraphs.\n`;
    llmPrompt += `- Do not add explanations, commentary, or extra lines. Output ONLY the sentence.\n\n`;
    if (CUSTOM_PROMPT_TEMPLATE && CUSTOM_PROMPT_TEMPLATE.trim()) {
      llmPrompt += `Persona:\n${CUSTOM_PROMPT_TEMPLATE}\n\n`;
    }
    if (seedTokens.length > 0) {
      llmPrompt += `If possible, include these seed words from the allowed list: ${seedTokens.join(
        " "
      )}.\n\n`;
    }
    llmPrompt += `Allowed words:\n${allowedListStr}\n\n`;
    llmPrompt += `Seed: ${prompt || ""}\n\nOutput:\n`;

    try {
      const response = await ollamaClient.generate({
        model,
        prompt: llmPrompt,
        options: { temperature },
      });
      const raw = response && response.response ? response.response.trim() : "";
      const text = raw.replace(/\n+/g, " ").trim();
      const toks = tokenize(text);

      const bad = toks.filter((t) => !(allowedSet && allowedSet.has(t)));
      if (bad.length === 0 && toks.length > 0) {
        return { text: capitalizeSentence(toks.join(" ")), tokens: toks };
      }

      // If LLM used disallowed words, retry; final fallback to local sampling
      if (attempt < maxAttempts) continue;
      // fallback
      const fallback = await predict(prompt, {
        length,
        mode: "sample",
        temperature,
      });
      fallback.warning =
        "LLM did not adhere to vocabulary constraints; returned fallback sampled prediction.";
      return fallback;
    } catch (err) {
      const fallback = await predict(prompt, {
        length,
        mode: "sample",
        temperature,
      });
      fallback.warning = `LLM error: ${err.message}`;
      return fallback;
    }
  }
}

export default {
  predict,
  tokenize,
  get words() {
    return words;
  },
  get counts() {
    return counts;
  },
};
