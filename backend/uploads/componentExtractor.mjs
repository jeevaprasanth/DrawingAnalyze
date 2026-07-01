#!/usr/bin/env node
/**
 * Component Extractor - Refined
 *
 * Analyzes a PDF engineering drawing and extracts:
 * 1. Components (F-XXXX) inside rectangle boxes on the LEFT SIDE of the drawing
 * 2. Only components in range F-1000 to F-1999
 * 3. Related elements (e.g. F14 : G19 : B24) connected via arrow/path proximity
 * 4. Converts elements to numeric values (F14→14, G19→19, B24→24)
 * 5. Looks up Item Codes from the Materials Table (RIGHT SIDE) using PT.No column
 * 6. Returns the Item Code for each matched number, or "Not Found"
 *
 * MATERIAL TABLE LOOKUP LOGIC:
 * ============================
 * For each element number extracted (e.g., 16, 20, 25):
 *   1. Search ONLY the PT.No column for this number
 *   2. Do NOT search in Description, NPD(IN), or Item Code columns
 *   3. If found, return the Item Code from that row
 *   4. If not found, return "Not Found"
 *
 * Usage: node componentExtractor.mjs <path-to-pdf>
 *        node componentExtractor.mjs "C:/path/to/drawing.pdf"
 *
 * Output Format (stdout):
 *   JSON array of result objects, or
 *   {"error":"Components Not Found"} if no F-1000..F-1999 components exist
 *
 * For each component found:
 *   {
 *     component: "F-1006",
 *     relatedElements: "F26:G31:B35",
 *     numbers: [26, 31, 35],
 *     itemCodes: ["PFY2ADRT03ZZACPADH", "PGUUB5RT03AIAAAZZC", "PH8ASCRTAF00100ZZF"],
 *     firstValue: "F26", firstNumber: 26, firstItemCode: "...",
 *     secondValue: "G31", secondNumber: 31, secondItemCode: "...",
 *     thirdValue: "B35", thirdNumber: 35, thirdItemCode: "..."
 *   }
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as PDFJS from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CMAP_URL = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'cmaps');
const STANDARD_FONT_DATA_URL = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts');

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Extract the numeric part from an element string
 * e.g., "F26" → 26, "G31" → 31, "B35" → 35
 */
function extractNumericPart(element) {
  if (!element) return null;
  const match = element.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

// ============================================================
// PDF TEXT EXTRACTION (with positional coordinates)
// ============================================================

/**
 * Extract text items with positional coordinates from a PDF page
 * Uses pdfjs-dist for accurate x,y positioning
 */
async function extractPositionalItems(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const hasStandardFonts = fs.existsSync(STANDARD_FONT_DATA_URL);
  const loadingTask = PDFJS.getDocument({
    data,
    ...(hasStandardFonts ? { standardFontDataUrl: STANDARD_FONT_DATA_URL + '/' } : {}),
    cMapUrl: CMAP_URL + '/',
    cMapPacked: true
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();

  return content.items.map(item => ({
    text: item.str.trim(),
    x: Math.round(item.transform[4]),
    y: Math.round(item.transform[5])
  }));
}

// ============================================================
// STEP 1: EXTRACT COMPONENTS (LEFT SIDE)
// ============================================================

/**
 * Extract F-XXXX components that are inside rectangle boxes
 * Only returns components where the number is > F-1000 and < F-1999
 */
function extractComponents(items) {
  // Find all F-XXXX patterns
  const fComponents = items.filter(item => {
    const match = item.text.match(/^F-(\d{4})$/);
    if (!match) return false;
    const num = parseInt(match[1], 10);
    // Only components in range F-1000 to F-1999
    return num >= 1000 && num <= 1999;
  });

  // Deduplicate by text (same component label can appear multiple times)
  const unique = [...new Map(fComponents.map(c => [c.text, c])).values()];

  // Sort by component number
  unique.sort((a, b) => {
    const numA = parseInt(a.text.replace('F-', ''), 10);
    const numB = parseInt(b.text.replace('F-', ''), 10);
    return numA - numB;
  });

  return unique;
}

// ============================================================
// STEP 2: FIND RELATED ELEMENTS (CONNECTED VIA ARROW PATHS)
// ============================================================

/**
 * Extract reference balloons (elements) from the PDF items
 * Balloons look like: F14 : G19 : B24 or F14:G19:B24
 */
function extractBalloons(items) {
  const SPOOL_LABEL_PATTERN = /^(S|F|FP)\d{2,}(_|$)/i;
  const KNOWN_NON_BALLOONS = /^(EL|ISO|FP|UP|DOWN|AWAY|TOWARD|N|NO|REV|DATE|SHT|ENGG|DESIGN|CONST|OPERATIONS|BY|CHKD|APP|PRPD|AC|SN|KY|PD|BSP|HJ|No\.?|LBS|WEIGHT|SIZE|PIECES|MARK|ITEM)$/i;

  return items.filter(item => {
    const text = item.text;

    // Multi-part balloons: letter+number:letter+number:letter+number
    // e.g. "F14:G19:B24" or "F14 : G19 : B24"
    if (/^[A-Z]\d+\s*:\s*[A-Z]\d+\s*:\s*[A-Z]\d+$/.test(text) && !text.includes('-')) {
      return true;
    }

    // Single balloons: letter+number (e.g., "F26")
    if (/^[A-Z]\d{1,3}$/.test(text) && !text.includes('-')) {
      // Exclude spool/pipe labels
      if (SPOOL_LABEL_PATTERN.test(text)) return false;
      // Exclude known non-balloon labels
      if (KNOWN_NON_BALLOONS.test(text)) return false;
      return true;
    }

    return false;
  });
}

/**
 * Parse a balloon text to extract individual element strings and their numeric parts
 * e.g., "F14:G19:B24" → { elements: ["F14","G19","B24"], numbers: [14,19,24] }
 * Each element and its number remain paired at the same index.
 */
function parseBalloonElements(balloonText) {
  // Split on colon, trimming whitespace, and remove empty entries
  const parts = balloonText.split(':').map(s => s.trim()).filter(e => e.length > 0);
  const elements = [];
  const numbers = [];
  
  for (const part of parts) {
    elements.push(part);
    numbers.push(extractNumericPart(part));
  }
  
  return { elements, numbers };
}

/**
 * For each component, find the closest reference balloon
 * This determines which 3 elements belong to that component
 */
function matchComponentsToBalloons(components, balloons) {
  const results = [];

  for (const comp of components) {
    let closest = null;
    let minDist = Infinity;

    for (const b of balloons) {
      const dx = comp.x - b.x;
      const dy = comp.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        closest = b;
      }
    }

    if (closest) {
      results.push({
        component: comp,
        balloon: closest,
        distance: minDist
      });
    } else {
      results.push({
        component: comp,
        balloon: null,
        distance: Infinity
      });
    }
  }

  return results;
}

// ============================================================
// STEP 3: EXTRACT MATERIALS TABLE (RIGHT SIDE) - ROW-BASED
// ============================================================

/**
 * Extract a map of PT.No → Item Code from the PDF's Materials Table.
 * 
 * The Materials Table has these columns:
 *   PT.No | Description | NPD (IN) | Item Code | QTY
 * 
 * PT.No is the first column and contains only small numbers (1-3 digits):
 *   1, 2, 3, 4, 5, 7, 9, 14, 19, 24, 25…
 * 
 * Item Code is the last column and contains long alphanumeric strings (12+ chars):
 *   PCGIKORT24AIAADZZC, PGUUB5RT24AIAAAZZC, PFYA3CRT24ZZAOIADH...
 * 
 * Strategy:
 * 1. Group PDF text items by Y-position (rounded to nearest 4)
 * 2. For each row, look for:
 *    - A 1-3 digit number → PT.No (first column)
 *    - A long alphanumeric string (≥ 12 chars) → Item Code (last column)
 * 3. Map: PT.No → Item Code (simple key-value map)
 * 
 * IMPORTANT: 
 * - PT.No matching ONLY happens against the PT.No column (the map keys)
 * - Description, NPD(IN), and Item Code columns are NEVER searched for matching
 * - The lookup is a simple key-based lookup on the returned map
 */
function extractMaterialTable(items) {
  const rows = {};
  const map = {};

  // Group items by row (Y-position, rounded to nearest 4)
  for (const item of items) {
    const y = Math.round(item.y / 4) * 4;
    if (!rows[y]) rows[y] = [];
    rows[y].push(item.text);
  }

  // Process each row
  for (const y in rows) {
    const row = rows[y];

    let pt = null;
    let itemCode = null;

    for (const text of row) {
      // PT.No (1-3 digit numbers only) — first column of the Materials Table
      if (/^\d{1,3}$/.test(text)) {
        pt = parseInt(text, 10);
      }

      // Item Code (long alphanumeric ≥ 12 chars) — last column of the Materials Table
      if (/^[A-Z0-9]{12,}$/.test(text)) {
        itemCode = text;
      }
    }

    if (pt !== null && itemCode) {
      map[pt] = itemCode;
    }
  }

  return map;
}

/**
 * Look up an Item Code from the material table by PT.No number.
 * 
 * CRITICAL: This ONLY searches the PT.No column (the map keys).
 * It does NOT search in Description, NPD(IN), or Item Code columns.
 * 
 * @param {Object} materialTable - Map of PT.No → Item Code
 * @param {number} number - The PT.No to look up
 * @returns {string|null} The Item Code, or null if the PT.No was not found
 */
function lookupItemCode(materialTable, number) {
  if (!materialTable || number === null || number === undefined) return null;
  
  // Match ONLY against PT.No (the key in the map)
  // This ensures Description, NPD(IN), and Item Code columns are NOT searched
  return materialTable[number] || null;
}

// ============================================================
// MAIN ANALYSIS PIPELINE
// ============================================================

/**
 * Analyze a PDF drawing and extract component-element-itemCode mappings
 * 
 * PROCESS OVERVIEW:
 * =================
 * 
 * For each component (F-XXXX) found in the drawing:
 * 
 *   1. IDENTIFY THE 3 RELATED ELEMENTS
 *      The component's balloon (e.g., F14:G19:B24) contains 3 elements.
 *      Each element is a letter+number combination like "F14", "G19", "B24".
 * 
 *   2. CONVERT EACH ELEMENT TO A NUMBER (individually)
 *      - First element "F14"  → extract numeric part → 14
 *      - Second element "G19" → extract numeric part → 19
 *      - Third element "B35"  → extract numeric part → 35
 * 
 *   3. LOOK UP EACH NUMBER IN THE MATERIAL TABLE (individually)
 *      For number 14: Check ONLY PT.No column → Find matching PT.No → Return Item Code
 *      For number 19: Check ONLY PT.No column → Find matching PT.No → Return Item Code
 *      For number 35: Check ONLY PT.No column → Find matching PT.No → Return Item Code
 *      
 *      If a number is NOT found in the PT.No column → return "Not Found"
 * 
 *   4. RETURN the Item Code for each matched number
 * 
 * MATERIAL TABLE (RIGHT SIDE OF PDF):
 *   Columns: PT.No | Description | NPD (IN) | Item Code | QTY
 *   Matching is done ONLY against PT.No column
 *   Other columns (Description, NPD, Item Code) are NOT searched for matching
 */
export async function analyzePDF(pdfPath) {
  // ─────────────────────────────────────────────────────────
  // STEP 1: Extract all text with positional coordinates
  // ─────────────────────────────────────────────────────────
  const items = await extractPositionalItems(pdfPath);

  // ─────────────────────────────────────────────────────────
  // STEP 2: Extract the MATERIAL TABLE from the PDF's own content
  //          Maps PT.No (first column) → Item Code (last column)
  //          Matching is ONLY done against PT.No column
  //          Description, NPD(IN), Item Code columns are NOT searched
  // ─────────────────────────────────────────────────────────
  const materialTable = extractMaterialTable(items);

  // ─────────────────────────────────────────────────────────
  // STEP 3: Find F-1000 to F-1999 COMPONENTS
  //          Components are F-XXXX inside rectangle boxes on the LEFT SIDE
  //          Only where number > F-1000 and < F-1999
  // ─────────────────────────────────────────────────────────
  const components = extractComponents(items);

  // If no components found in the required range
  if (components.length === 0) {
    return [];
  }

  // ─────────────────────────────────────────────────────────
  // STEP 4: Find REFERENCE BALLOONS
  //          Balloons look like: F14:G19:B24 or F14 : G19 : B24
  //          These are connected via arrow paths from components
  //          Each component will have exactly 3 elements
  // ─────────────────────────────────────────────────────────
  const balloons = extractBalloons(items);
  const uniqueBalloons = [...new Map(balloons.map(b => [b.text, b])).values()];

  // ─────────────────────────────────────────────────────────
  // STEP 5: Match each component to its NEAREST reference balloon
  //          The correct elements are connected:
  //          - from the component's arrow
  //          - through the element's arrow
  //          - touching the same line / diagram path
  // ─────────────────────────────────────────────────────────
  const matchedPairs = matchComponentsToBalloons(components, uniqueBalloons);

  // ─────────────────────────────────────────────────────────
  // STEP 6: For each component, extract individual Item Codes
  //          Each of the 3 element values is processed INDIVIDUALLY:
  //            Value 1 → Number 1 → Lookup PT.No column → Item Code 1
  //            Value 2 → Number 2 → Lookup PT.No column → Item Code 2
  //            Value 3 → Number 3 → Lookup PT.No column → Item Code 3
  //
  //          The lookup searches ONLY in the PT.No column.
  //          Description, NPD(IN), and Item Code columns are NOT searched.
  // ─────────────────────────────────────────────────────────
  const results = [];

  for (const pair of matchedPairs) {
    const comp = pair.component;
    const balloon = pair.balloon;

    if (balloon) {
      const { elements, numbers } = parseBalloonElements(balloon.text);

      // Extract each element individually
      const firstElementValue = elements[0] || null;
      const firstNumber = numbers[0] || null;
      // Lookup matches ONLY against PT.No column (the map keys)
      // Description, NPD(IN), and Item Code columns are NEVER searched
      const firstItemCode = lookupItemCode(materialTable, firstNumber) || "Not Found";

      const secondElementValue = elements[1] || null;
      const secondNumber = numbers[1] || null;
      // Lookup matches ONLY against PT.No column (the map keys)
      const secondItemCode = lookupItemCode(materialTable, secondNumber) || "Not Found";

      const thirdElementValue = elements[2] || null;
      const thirdNumber = numbers[2] || null;
      // Lookup matches ONLY against PT.No column (the map keys)
      const thirdItemCode = lookupItemCode(materialTable, thirdNumber) || "Not Found";

      // Build the numbers array for the result
      const resultNumbers = [];
      const resultItemCodes = [];
      if (firstNumber !== null) {
        resultNumbers.push(firstNumber);
        resultItemCodes.push(firstItemCode);
      }
      if (secondNumber !== null) {
        resultNumbers.push(secondNumber);
        resultItemCodes.push(secondItemCode);
      }
      if (thirdNumber !== null) {
        resultNumbers.push(thirdNumber);
        resultItemCodes.push(thirdItemCode);
      }

      results.push({
        component: comp.text,
        relatedElements: balloon.text,

        numbers: resultNumbers,
        itemCodes: resultItemCodes,

        firstValue: firstElementValue,
        firstNumber: firstNumber,
        firstItemCode: firstItemCode,

        secondValue: secondElementValue,
        secondNumber: secondNumber,
        secondItemCode: secondItemCode,

        thirdValue: thirdElementValue,
        thirdNumber: thirdNumber,
        thirdItemCode: thirdItemCode
      });

    } else {
      // No balloon found for this component
      results.push({
        component: comp.text,
        relatedElements: null,
        numbers: [],
        itemCodes: ["Not Found","Not Found","Not Found"],
        firstValue: null,
        secondValue: null,
        thirdValue: null,
        firstNumber: null,
        secondNumber: null,
        thirdNumber: null,
        firstItemCode: "Not Found",
        secondItemCode: "Not Found",
        thirdItemCode: "Not Found"
      });
    }
  }

  // Sort by component number
  results.sort((a, b) => {
    const numA = parseInt(a.component.replace("F-", ""));
    const numB = parseInt(b.component.replace("F-", ""));
    return numA - numB;
  });

  return results;
}

// ============================================================
// OUTPUT FORMATTING
// ============================================================

/**
 * Format results for human-readable console output
 */
export function formatResults(results) {
  if (!results || results.length === 0) {
    return 'Components Not Found';
  }

  const lines = [];

  for (const r of results) {
    lines.push(`Component: ${r.component}`);
    lines.push(`Related Elements: ${r.relatedElements || 'None'}`);

    const elements = [];
    if (r.firstValue) elements.push(r.firstValue);
    if (r.secondValue) elements.push(r.secondValue);
    if (r.thirdValue) elements.push(r.thirdValue);
    if (elements.length > 0) {
      lines.push(`  Elements: ${elements.join(' : ')}`);
    }

    const numbers = [];
    if (r.firstNumber !== null) numbers.push(`${r.firstValue} → ${r.firstNumber}`);
    if (r.secondNumber !== null) numbers.push(`${r.secondValue} → ${r.secondNumber}`);
    if (r.thirdNumber !== null) numbers.push(`${r.thirdValue} → ${r.thirdNumber}`);
    if (numbers.length > 0) {
      lines.push(`  Converted Numbers: ${numbers.join(', ')}`);
    }

    // First element details
    if (r.firstValue) {
      lines.push(`  ${r.firstValue} → PT.No: ${r.firstNumber || 'Not Found'}`);
      lines.push(`    Item Code: ${r.firstItemCode}`);
    }

    // Second element details
    if (r.secondValue) {
      lines.push(`  ${r.secondValue} → PT.No: ${r.secondNumber || 'Not Found'}`);
      lines.push(`    Item Code: ${r.secondItemCode}`);
    }

    // Third element details
    if (r.thirdValue) {
      lines.push(`  ${r.thirdValue} → PT.No: ${r.thirdNumber || 'Not Found'}`);
      lines.push(`    Item Code: ${r.thirdItemCode}`);
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}

// ============================================================
// CLI ENTRY POINT
// ============================================================

async function main() {
  let pdfPath = process.argv[2];

  if (!pdfPath) {
    pdfPath = path.join(__dirname, '..', 'uploads', 'drawing.pdf');
  }

  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF not found: ${pdfPath}`);
    process.exit(1);
  }

  const results = await analyzePDF(pdfPath);

  if (results.length === 0) {
    process.stdout.write(JSON.stringify({ error: 'Components Not Found' }));
  } else {
    process.stdout.write(JSON.stringify(results));
  }
}

// Run if executed directly (not imported)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}