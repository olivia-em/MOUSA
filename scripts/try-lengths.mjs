#!/usr/bin/env node
import oracle from "../lib/oracle.js";

(async function run() {
  const lengths = [3, 6, 12];
  for (const L of lengths) {
    try {
      console.log(`\n--- length=${L} ---`);
      const res = await oracle.predict("tell of doom", {
        length: L,
        mode: "llm",
        temperature: 0.7,
      });
      console.log("text:", res.text);
      console.log("tokens:", (res.tokens || []).join(" "));
      console.log("count:", (res.tokens || []).length);
      if (res.warning) console.log("warning:", res.warning);
    } catch (err) {
      console.error("error for length", L, err.message);
    }
  }
})();
