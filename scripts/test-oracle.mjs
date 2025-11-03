#!/usr/bin/env node
import oracle from "../lib/oracle.js";

(async function run() {
  try {
    const res = await oracle.predict("prophecy", {
      length: 8,
      temperature: 1.0,
    });
    console.log("Prediction:", res.text);
    console.log("Tokens:", (res.tokens || []).join(" "));

    const allowed = new Set(oracle.words || []);
    const bad = (res.tokens || []).filter((t) => !allowed.has(t));
    if (bad.length) {
      console.error("ERROR: tokens not in dictionary:", bad);
      process.exit(2);
    }

    console.log("OK: all tokens present in dictionary");
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
})();
