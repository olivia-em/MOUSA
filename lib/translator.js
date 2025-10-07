import { Ollama } from "ollama";

class TranslationEngine {
  constructor(
    modelName = "llama3.2:3b",
    temperature = 0.3,
    host = "http://127.0.0.1:11434"
  ) {
    this.modelName = modelName;
    this.temperature = temperature;
    this.client = new Ollama({ host });
  }

  async checkModelAvailable() {
    try {
      const models = await this.client.list();
      const availableModels = models.models.map((model) => model.name);
      return availableModels.includes(this.modelName);
    } catch (error) {
      console.error("Error checking model availability:", error);
      return false;
    }
  }

  async translateGreekToEnglish(greekText) {
    const prompt = `Translate this Ancient Greek text to English. 

IMPORTANT: Provide ONLY the English translation. Do not include:
- Notes or explanations
- Commentary about translation choices  
- Analysis of vocabulary or style
- Any text after the translation

Ancient Greek:
${greekText}

English:`;

    try {
      const response = await this.client.generate({
        model: this.modelName,
        prompt: prompt,
        options: { temperature: this.temperature },
      });

      return this.cleanTranslation(response.response);
    } catch (error) {
      console.error("Greek to English translation failed:", error);
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  async translateEnglishToGreek(englishText) {
    const prompt = `Translate this English text to Ancient Greek in Homeric style.

IMPORTANT: Provide ONLY the Ancient Greek translation. Do not include:
- Notes about vocabulary choices
- Explanations of poetic devices
- Commentary about style
- Any text after the translation

English:
${englishText}

Ancient Greek:`;

    try {
      const response = await this.client.generate({
        model: this.modelName,
        prompt: prompt,
        options: { temperature: this.temperature },
      });

      return this.cleanTranslation(response.response);
    } catch (error) {
      console.error("English to Greek translation failed:", error);
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  async translateToEnglish(greekText, customPrompt = null) {
    if (customPrompt) {
      return await this.translateWithCustomPrompt(greekText, customPrompt);
    }
    return await this.translateGreekToEnglish(greekText);
  }

  async translateToGreek(englishText, customPrompt = null) {
    if (customPrompt) {
      return await this.translateWithCustomPrompt(englishText, customPrompt);
    }
    return await this.translateEnglishToGreek(englishText);
  }

  async translateWithCustomPrompt(text, customPrompt) {
    const prompt = `${customPrompt}

Text to translate:
${text}

Translation:`;

    try {
      const response = await this.client.generate({
        model: this.modelName,
        prompt: prompt,
        options: { temperature: this.temperature },
      });

      return this.cleanTranslation(response.response);
    } catch (error) {
      console.error("Custom prompt translation failed:", error);
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  cleanTranslation(translation) {
    let cleaned = translation.trim();

    // Remove common commentary patterns
    const commentaryTriggers = [
      "Note:",
      "Explanation:",
      "Commentary:",
      "Analysis:",
      "(repeated",
      "(this",
      "(the",
      "Here",
      "This",
      "I have",
      "The above",
      "In this",
    ];

    for (const trigger of commentaryTriggers) {
      if (cleaned.includes(trigger)) {
        cleaned = cleaned.split(trigger)[0].trim();
      }
    }

    // Remove bullet points and explanatory lists
    if (cleaned.includes("*") && (cleaned.match(/\*/g) || []).length > 2) {
      const lines = cleaned.split("\n");
      const cleanLines = lines.filter((line) => !line.trim().startsWith("*"));
      cleaned = cleanLines.join("\n").trim();
    }

    // Remove parenthetical explanations but keep pure Greek
    const lines = cleaned.split("\n");
    const cleanLines = [];

    for (const line of lines) {
      // If line contains parentheses with English explanations, remove them
      const englishWords = [
        "repeated",
        "times",
        "three",
        "this",
        "the",
        "a",
        "an",
      ];
      if (
        line.includes("(") &&
        englishWords.some((word) => line.toLowerCase().includes(word))
      ) {
        continue; // Skip explanatory lines
      }
      cleanLines.push(line);
    }

    cleaned = cleanLines.join("\n").trim();
    return cleaned;
  }
}

class DegradationAnalyzer {
  static calculateTextSimilarity(original, final) {
    try {
      // Word-based similarity matching Python implementation
      const originalWords = new Set(original.toLowerCase().split(/\s+/));
      const finalWords = new Set(final.toLowerCase().split(/\s+/));

      if (originalWords.size === 0) {
        return 0.0;
      }

      const intersection = new Set(
        [...originalWords].filter((x) => finalWords.has(x))
      );
      const union = new Set([...originalWords, ...finalWords]);

      return union.size > 0 ? intersection.size / union.size : 0.0;
    } catch (error) {
      console.error("Text similarity calculation failed:", error);
      return 0.0;
    }
  }

  calculateSimilarity(original, final) {
    // Alias for calculateTextSimilarity for compatibility
    return DegradationAnalyzer.calculateTextSimilarity(original, final);
  }

  analyzeDegradation(original, final) {
    try {
      const similarity = this.calculateSimilarity(original, final);
      const lengthChange = final.length - original.length;

      return {
        key_changes: [
          `Text length: ${original.length} → ${final.length} characters`,
          `Similarity score: ${(similarity * 100).toFixed(1)}%`,
          "Vocabulary and style have shifted through translation cycles",
        ],
        summary: `Translation degraded through ${Math.abs(
          lengthChange
        )} character change with ${(similarity * 100).toFixed(
          1
        )}% similarity remaining`,
        final_similarity: similarity,
        length_change: lengthChange,
        length_ratio:
          original.length > 0 ? final.length / original.length : 1.0,
        degradation_level:
          similarity < 0.5 ? "high" : similarity < 0.8 ? "moderate" : "low",
      };
    } catch (error) {
      console.error("Degradation analysis failed:", error);
      return {
        key_changes: ["Analysis failed"],
        summary: "Unable to analyze degradation",
        final_similarity: 0.0,
        length_change: 0,
        length_ratio: 1.0,
        degradation_level: "unknown",
      };
    }
  }
}

export { TranslationEngine, DegradationAnalyzer };
