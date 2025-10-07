import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { TranslationEngine, DegradationAnalyzer } from "./lib/translator.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5001;

// Configuration
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.static("public"));

// Ensure results directory exists
const ensureDirectoryExists = async (dir) => {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
};

// Initialize results directory
ensureDirectoryExists("results");

// Routes
app.get("/", (req, res) => {
  res.render("index");
});

app.post("/api/single-translate", async (req, res) => {
  try {
    const { text, is_greek } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "No text provided" });
    }

    const modelName = "llama3.2:3b";
    const engine = new TranslationEngine(modelName);

    if (is_greek) {
      // Greek to English - Poet personality
      const poetPrompt = `You are a passionate poet who translates with creative flair and dramatic expression.
Translate this Ancient Greek text to English, while capturing its epic spirit and emotional power.
Embrace vivid imagery, grand language, and the heroic tone of classical literature.
Provide ONLY the English translation, no explanations.`;

      const translation = await engine.translateToEnglish(text, poetPrompt);
      return res.json({
        translation,
        is_greek: false,
        model_used: `${modelName} (Poet)`,
        direction: "Greek → English",
      });
    } else {
      // English to Greek - Muse personality
      const musePrompt = `You are the divine Muse of epic poetry, weaving words with supernatural grace.
Translate this English text to Ancient Greek.
Channel divine inspiration, using magical epithets, mystical language and patterns, and the sacred rhythm of the gods.
Let your translation flow with otherworldly beauty and mythic power.
Give absolutely NO explanations.`;

      const translation = await engine.translateToGreek(text, musePrompt);
      return res.json({
        translation,
        is_greek: true,
        model_used: `${modelName} (Muse)`,
        direction: "English → Greek",
      });
    }
  } catch (error) {
    console.error("Single translate error:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/translate", async (req, res) => {
  try {
    const { text, cycles, model, passage_name } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "No text provided" });
    }

    const cycleCount = parseInt(cycles) || 3;
    if (cycleCount < 1 || cycleCount > 10) {
      return res.status(400).json({ error: "Cycles must be between 1 and 10" });
    }

    const modelName = model || "llama3.2:3b";
    const engine = new TranslationEngine(modelName);
    const analyzer = new DegradationAnalyzer();

    const results = {
      original: text,
      cycles: [],
      metadata: {
        passage_name: passage_name || "custom",
        model: modelName,
        total_cycles: cycleCount,
        timestamp: new Date().toISOString(),
      },
    };

    let currentText = text;

    for (let cycle = 1; cycle <= cycleCount; cycle++) {
      // Greek to English
      const englishTranslation = await engine.translateToEnglish(currentText);

      // English back to Greek
      const greekTranslation = await engine.translateToGreek(
        englishTranslation
      );

      // Calculate similarity
      const similarity = analyzer.calculateSimilarity(text, greekTranslation);

      const cycleResult = {
        cycle,
        english: englishTranslation,
        greek: greekTranslation,
        similarity,
      };

      results.cycles.push(cycleResult);
      currentText = greekTranslation;
    }

    // Add final analysis
    results.analysis = analyzer.analyzeDegradation(text, currentText);

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `web_results_${timestamp}.json`;
    const filepath = path.join("results", filename);

    await fs.writeFile(filepath, JSON.stringify(results, null, 2), "utf-8");
    results.saved_file = filename;

    return res.json(results);
  } catch (error) {
    console.error("Translation cycle error:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/passages/:filename", async (req, res) => {
  try {
    let filename = req.params.filename;
    if (!filename.endsWith(".txt")) {
      filename += ".txt";
    }

    const filepath = path.join("passages", filename);

    try {
      const content = await fs.readFile(filepath, "utf-8");
      return res.json({
        filename,
        content: content.trim(),
        length: content.trim().length,
      });
    } catch (error) {
      return res.status(404).json({ error: "Passage not found" });
    }
  } catch (error) {
    console.error("Get passage error:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/results", async (req, res) => {
  try {
    const resultsDir = "results";
    const resultsFiles = [];

    try {
      const files = await fs.readdir(resultsDir);

      for (const filename of files) {
        if (filename.endsWith(".json")) {
          const filepath = path.join(resultsDir, filename);
          const stats = await fs.stat(filepath);

          let metadata = {};
          try {
            const content = await fs.readFile(filepath, "utf-8");
            const data = JSON.parse(content);
            metadata = data.metadata || {};
          } catch {
            // Ignore metadata read errors
          }

          resultsFiles.push({
            filename,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            metadata,
          });
        }
      }
    } catch {
      // Results directory doesn't exist or is empty
    }

    // Sort by modification time (newest first)
    resultsFiles.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    return res.json(resultsFiles);
  } catch (error) {
    console.error("List results error:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.get("/results/:filename", (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(__dirname, "results", filename);
  res.download(filepath, (err) => {
    if (err) {
      res.status(404).json({ error: "File not found" });
    }
  });
});

app.listen(port, () => {
  console.log("Starting Μοῦσα Translation Degradation Explorer...");
  console.log(`Open your browser to: http://localhost:${port}`);
});
