#!/usr/bin/env node
/**
 * CLI wrapper for componentExtractor.mjs
 * Usage: node runComponentExtractor.mjs <path-to-pdf>
 * 
 * Outputs JSON to stdout:
 *   - JSON array of component analysis results when components found
 *   - {"error":"Components Not Found"} when no F-1000 to F-1999 components exist
 * 
 * Each result object contains:
 *   component, relatedElements, numbers[], itemCodes[],
 *   firstValue, secondValue, thirdValue,
 *   firstNumber, secondNumber, thirdNumber,
 *   firstItemCode, secondItemCode, thirdItemCode
 * 
 * If the PDF can't be read, outputs error to stderr and exits with code 1.
 */
import { analyzePDF } from './componentExtractor.mjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error('Usage: node runComponentExtractor.mjs <path-to-pdf>');
    process.exit(1);
  }
  
  const resolvedPath = path.resolve(pdfPath);
  
  if (!fs.existsSync(resolvedPath)) {
    console.error(`PDF not found: ${resolvedPath}`);
    process.exit(1);
  }
  
  const results = await analyzePDF(resolvedPath);
  
  // Output proper JSON
  if (results.length === 0) {
    // No components in F-1000 to F-1999 range
    process.stdout.write(JSON.stringify({ error: 'Components Not Found' }));
  } else {
    process.stdout.write(JSON.stringify(results));
  }
}

main().catch(err => {
  process.stderr.write(err.message);
  process.exit(1);
});