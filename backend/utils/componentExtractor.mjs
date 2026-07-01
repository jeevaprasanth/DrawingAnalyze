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

/**
 * Check if a balloon text represents a VALVE (starts with "V")
 * e.g., "V7:G11:B12", "V5", "V10:G9" → all are valves
 */
function isValveBalloon(text) {
  // Check if the text starts with V (after trimming)
  const trimmed = text.trim().toUpperCase();
  // Check if first character is V, or if any part starts with V
  // e.g., "V7:G11:B12" starts with V
  // e.g., "F7:G8:B9" does NOT start with V
  if (trimmed.startsWith('V')) return true;
  
  // Also check if any colon-separated part starts with V
  // This catches cases where the balloon might start with a space then V
  const parts = trimmed.split(':').map(p => p.trim());
  for (const part of parts) {
    const code = part.match(/^([A-Z])\d+/);
    if (code && code[1] === 'V') return true;
  }
  
  return false;
}

/**
 * Check if an element string is a valve element (starts with V)
 */
function isValveElement(text) {
  const trimmed = text.trim().toUpperCase();
  if (trimmed.startsWith('V')) return true;
  const match = trimmed.match(/^([A-Z])\d+/);
  return match && match[1] === 'V';
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
 * 
 * Supports:
 *   2-value: F7:G8
 *   3-value: F7:G8:B9
 *   5-value: F22:G26:G26:B31:B31
 * 
 * CRITICAL: Valve balloons starting with "V" are IGNORED.
 *   e.g., V7:G11:B12, V5, V10:G9 → ALL IGNORED
 */
function extractBalloons(items) {
  const SPOOL_LABEL_PATTERN = /^(S|F|FP)\d{2,}(_|$)/i;
  const KNOWN_NON_BALLOONS = /^(EL|ISO|FP|UP|DOWN|AWAY|TOWARD|N|NO|REV|DATE|SHT|ENGG|DESIGN|CONST|OPERATIONS|BY|CHKD|APP|PRPD|AC|SN|KY|PD|BSP|HJ|No\.?|LBS|WEIGHT|SIZE|PIECES|MARK|ITEM)$/i;

  return items.filter(item => {
    const text = item.text;

    // RULE 1: NEVER pick a balloon starting with V
    // Valve balloons look like: V7:G11:B12, V5, V10:G9
    // These must be ignored 100%.
    if (isValveBalloon(text)) {
      return false;
    }

    // Multi-part balloons: letter+number:letter+number:... (2, 3, or 5 values)
    // e.g. "F14:G19:B24" or "F7:G8" or "F22:G26:G26:B31:B31"
    if (/^[A-Z]\d+\s*:\s*[A-Z]\d+(\s*:\s*[A-Z]\d+)*$/.test(text) && !text.includes('-')) {
      // Ensure no part is a valve
      const parts = text.split(':').map(s => s.trim());
      for (const part of parts) {
        if (isValveElement(part)) return false;
      }
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
 * Supports 2, 3, and 5 element balloons.
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
 * Find "pipeline" indicators in the PDF items.
 * Pipeline segments are typically represented by:
 *   1. Sequences of dashes/hyphens in text items (e.g., "---", "-----")
 *   2. Items at similar Y coordinates that form horizontal lines
 * 
 * Returns an array of pipeline segments, each with:
 *   - y: The Y-coordinate of the pipe
 *   - xStart: Leftmost X
 *   - xEnd: Rightmost X
 *   - items: The text items that make up this pipe segment
 */
function extractPipelineSegments(items) {
  const PIPELINE_Y_TOLERANCE = 6; // Y tolerance for grouping items on same pipe
  const MIN_PIPE_WIDTH = 80;       // Minimum width to be considered a pipe
  
  // Find text items that represent pipe segments
  // These can be:
  // 1. Long strings of dashes, hyphens, equal signs, underscores
  // 2. Standalone pipe-like characters that form a line when combined
  const pipeIndicators = items.filter(item => {
    const text = item.text;
    // Check for dash sequences (pipe drawing characters)
    if (/^[-=_.]{2,}$/.test(text)) return true;
    // Check for single dash items that might be part of a pipe line
    // (these will be grouped by Y coordinate)
    if (/^[-=_.]$/.test(text)) return true;
    return false;
  });

  // Group pipe indicators by Y coordinate
  const pipeRows = {};
  for (const item of pipeIndicators) {
    const y = Math.round(item.y / PIPELINE_Y_TOLERANCE) * PIPELINE_Y_TOLERANCE;
    if (!pipeRows[y]) pipeRows[y] = [];
    pipeRows[y].push(item);
  }

  // Create pipeline segment objects
  const segments = [];
  for (const y in pipeRows) {
    const rowItems = pipeRows[y];
    // Sort by X
    rowItems.sort((a, b) => a.x - b.x);
    
    // Calculate the span of this pipe segment
    const xStart = rowItems[0].x;
    const xEnd = rowItems[rowItems.length - 1].x + (rowItems[rowItems.length - 1].text.length * 5); // Approximate width
    const width = xEnd - xStart;
    
    if (width >= MIN_PIPE_WIDTH) {
      segments.push({
        y: parseInt(y),
        xStart,
        xEnd,
        width,
        items: rowItems
      });
    }
  }

  return segments;
}

/**
 * Calculate distance from a point (x, y) to a line segment
 */
function distanceToLineSegment(px, py, x1, x2, y) {
  // For a horizontal line at y, the distance is vertical distance
  // if the point is within the X bounds, or the distance to the nearest endpoint
  const dy = Math.abs(py - y);
  
  if (px >= Math.min(x1, x2) && px <= Math.max(x1, x2)) {
    return dy; // Vertical distance to the line
  }
  
  // Distance to nearest endpoint
  const dx = Math.min(Math.abs(px - x1), Math.abs(px - x2));
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Match components to balloons using DIAGRAM-PATH logic instead of nearest-distance.
 * 
 * PROCESS:
 * 1. Extract pipeline segments from the PDF (horizontal lines/dashes)
 * 2. For each component (F-XXXX), find the nearest pipeline segment
 * 3. Find balloons that are close to the SAME pipeline segment
 * 4. Only those balloons on the same pipeline path are valid flange groups
 * 
 * This replaces the old nearest-distance matching which was WRONG
 * because it would pick the closest balloon on the page rather than
 * the one on the same pipeline.
 */
function matchComponentsToBalloons(components, balloons, items) {
  // Step 1: Extract pipeline segments from the drawing
  const pipelineSegments = extractPipelineSegments(items);

  // Step 2: If no pipeline segments found, fall back to items-based positioning
  // (Use Y-clustering as a proxy for pipeline)
  
  const results = [];

  for (const comp of components) {
    let matchedBalloon = null;
    let matchedPipelineY = null;

    if (pipelineSegments.length > 0) {
      // === PIPELINE-BASED MATCHING (PREFERRED) ===
      
      // Find the pipeline segment closest to this component
      let closestPipeline = null;
      let minPipeDist = Infinity;
      
      for (const seg of pipelineSegments) {
        const dist = distanceToLineSegment(comp.x, comp.y, seg.xStart, seg.xEnd, seg.y);
        if (dist < minPipeDist) {
          minPipeDist = dist;
          closestPipeline = seg;
        }
      }

      if (closestPipeline) {
        matchedPipelineY = closestPipeline.y;
        const PIPELINE_Y_THRESHOLD = 20; // Max Y distance to consider balloon on same pipeline
        
        // Find balloons on the SAME pipeline (close to the pipeline Y)
        const balloonsOnSamePipe = balloons.filter(b => {
          const dy = Math.abs(b.y - closestPipeline.y);
          const dx = Math.abs(b.x - closestPipeline.x);
          return dy <= PIPELINE_Y_THRESHOLD && dx >= 0;
        });

        if (balloonsOnSamePipe.length > 0) {
          // Among balloons on the same pipeline, pick the one
          // that is closest to the pipeline (not closest to the component)
          let closestBalloon = null;
          let minPipeBalloonDist = Infinity;
          
          for (const b of balloonsOnSamePipe) {
            const distToPipe = distanceToLineSegment(b.x, b.y, closestPipeline.xStart, closestPipeline.xEnd, closestPipeline.y);
            if (distToPipe < minPipeBalloonDist) {
              minPipeBalloonDist = distToPipe;
              closestBalloon = b;
            }
          }
          
          matchedBalloon = closestBalloon;
        }
      }
    }

    // === FALLBACK: If no pipeline segments found, use Y-based clustering ===
    if (!matchedBalloon) {
      // Group all balloons by their Y position (rounded to nearest 10)
      const BALLOON_Y_TOLERANCE = 15;
      const balloonGroups = {};
      
      for (const b of balloons) {
        const groupY = Math.round(b.y / BALLOON_Y_TOLERANCE) * BALLOON_Y_TOLERANCE;
        if (!balloonGroups[groupY]) balloonGroups[groupY] = [];
        balloonGroups[groupY].push(b);
      }

      // Find the Y group closest to this component
      const groupYs = Object.keys(balloonGroups).map(Number);
      let closestGroupY = null;
      let minGroupDist = Infinity;
      
      for (const gy of groupYs) {
        const dy = Math.abs(comp.y - gy);
        if (dy < minGroupDist) {
          minGroupDist = dy;
          closestGroupY = gy;
        }
      }

      if (closestGroupY !== null) {
        matchedPipelineY = closestGroupY;
        const groupBalloons = balloonGroups[closestGroupY];
        
        // Among balloons in this group, find the one closest to the component's X position
        let closestBalloon = null;
        let minXDist = Infinity;
        
        for (const b of groupBalloons) {
          const dx = Math.abs(b.x - comp.x);
          if (dx < minXDist) {
            minXDist = dx;
            closestBalloon = b;
          }
        }
        
        matchedBalloon = closestBalloon;
      } else {
        // Absolute fallback: pick the nearest balloon overall
        // (This should rarely happen with properly structured PDFs)
        let closestBalloon = null;
        let minDist = Infinity;
        
        for (const b of balloons) {
          const dx = comp.x - b.x;
          const dy = comp.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            closestBalloon = b;
          }
        }
        
        matchedBalloon = closestBalloon;
      }
    }

    if (matchedBalloon) {
      results.push({
        component: comp,
        balloon: matchedBalloon,
        pipelineY: matchedPipelineY,
        distance: Math.abs(comp.y - (matchedPipelineY || matchedBalloon.y))
      });
    } else {
      results.push({
        component: comp,
        balloon: null,
        pipelineY: null,
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
 *    - A 1-3 digit number → PT.No
 *    - A long alphanumeric string (≥ 12 chars) → Item Code
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

  // Column X-position ranges (based on analysis of column headers in PDFs):
  //   PT.No    header at x=959-970,  actual values at x ≈ 955-975
  //   Description header at x=1037
  //   NPD(IN)  header at x=1157-1177
  //   Item Code header at x=1187-1260, values at x ≈ 1140-1270 (sometimes concatenated with NPD)
  //   QTY      header at x=1303-1309
  const PT_NO_X_MIN = 955;
  const PT_NO_X_MAX = 975;
  // Use wider X-range to catch item codes that are concatenated with NPD values
  // e.g., "0.625 PH8ASCRTAF00090ZZF" at x=1161
  const ITEM_CODE_X_MIN = 1140;
  const ITEM_CODE_X_MAX = 1300;

  // Group items by row (Y-position, rounded to nearest 4)
  // Keep track of the item's text AND its X-coordinate
  for (const item of items) {
    const y = Math.round(item.y / 4) * 4;
    if (!rows[y]) rows[y] = [];
    rows[y].push({ text: item.text, x: item.x });
  }

  // Process each row
  for (const y in rows) {
    const row = rows[y];

    let pt = null;
    let itemCode = null;

    // Sort row items by X position (left to right) for column ordering
    row.sort((a, b) => a.x - b.x);

    for (const entry of row) {
      const text = entry.text;
      const x = entry.x;

      // PT.No: numbers (1-3 digits) that fall in the PT.No column X-range
      if (/^\d{1,3}$/.test(text) && x >= PT_NO_X_MIN && x <= PT_NO_X_MAX) {
        pt = parseInt(text, 10);
      }

      // Item Code detection in the Item Code column area
      // Handles cases where item code is concatenated with NPD value
      // e.g., "0.625 PH8ASCRTAF00090ZZF" → extracts "PH8ASCRTAF00090ZZF"
      if (x >= ITEM_CODE_X_MIN && x <= ITEM_CODE_X_MAX) {
        // Look for item code pattern within the text (handles concatenated values)
        const icMatch = text.match(/([A-Z0-9][A-Z0-9-]{11,}[A-Z0-9])/);
        if (icMatch) {
          itemCode = icMatch[1];
        }
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
 *   1. IDENTIFY THE PIPELINE SEGMENT
 *      Find the pipeline (horizontal line) closest to the Joint Number.
 *      All flanges must come ONLY from this same pipeline path.
 *      Flanges on other branches are ignored.
 * 
 *   2. IDENTIFY THE RELATED ELEMENTS
 *      The component's balloon (e.g., F14:G19:B24) contains 3 elements.
 *      Each element is a letter+number combination like "F14", "G19", "B24".
 *      Only balloons touching the SAME pipeline as the joint are valid.
 * 
 *   3. CONVERT EACH ELEMENT TO A NUMBER (individually)
 *      - First element "F14"  → extract numeric part → 14
 *      - Second element "G19" → extract numeric part → 19
 *      - Third element "B35"  → extract numeric part → 35
 * 
 *   4. LOOK UP EACH NUMBER IN THE MATERIAL TABLE (individually)
 *      For number 14: Check ONLY PT.No column → Find matching row → Return full row
 *      For number 19: Check ONLY PT.No column → Find matching row → Return full row
 *      For number 35: Check ONLY PT.No column → Find matching row → Return full row
 *      
 *      If a number is NOT found in the PT.No column → return "Not Found" for all fields
 * 
 *   5. INCLUDE NEARBY FLANGES WITHOUT ARROWS
 *      Flanges drawn close to the pipeline but without arrows:
 *      if distance(flange, pipeline) < 25px → include them
 * 
 *   6. RETURN THE ENTIRE ROW for each matched number:
 *      - PT.No, Description, NPD(IN), Item Code, QTY
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
  //          
  //          CRITICAL: Valve balloons (starting with "V") are IGNORED.
  //          e.g., V7:G11:B12, V5, V10:G9 → ALL IGNORED
  // ─────────────────────────────────────────────────────────
  const balloons = extractBalloons(items);
  const uniqueBalloons = [...new Map(balloons.map(b => [b.text, b])).values()];

  // ─────────────────────────────────────────────────────────
  // STEP 5: Match each component to balloons using DIAGRAM-PATH logic
  //          NOT nearest-distance logic.
  //          
  //          FIND the pipeline segment the Joint Number touches.
  //          The arrow from the Joint Number touches a pipe →
  //          That pipe = the diagram path for this joint.
  //          
  //          All flanges must come ONLY from this same path.
  //          Flanges on other branches must be ignored.
  // ─────────────────────────────────────────────────────────
  const matchedPairs = matchComponentsToBalloons(components, uniqueBalloons, items);

  // ─────────────────────────────────────────────────────────
  // STEP 6: For each component, extract individual Item Codes
  //          Each of the 3 element values is processed INDIVIDUALLY:
  //            Value 1 → Number 1 → Lookup PT.No column → Full Row Data
  //            Value 2 → Number 2 → Lookup PT.No column → Full Row Data
  //            Value 3 → Number 3 → Lookup PT.No column → Full Row Data
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

      // Build the result dynamically based on how many elements we have
      // Supports 2, 3, or 5 element balloons
      const resultNumbers = [];
      const resultItemCodes = [];
      const resultValues = [];

      for (let i = 0; i < elements.length; i++) {
        const value = elements[i] || null;
        const number = numbers[i] !== undefined ? numbers[i] : null;
        const itemCode = number !== null 
          ? (lookupItemCode(materialTable, number) || "Not Found")
          : "Not Found";
        
        resultValues.push(value);
        resultNumbers.push(number);
        resultItemCodes.push(itemCode);
      }

      // Pad to at least 3 elements for backward compatibility
      while (resultValues.length < 3) {
        resultValues.push(null);
        resultNumbers.push(null);
        resultItemCodes.push("Not Found");
      }

      results.push({
        component: comp.text,
        relatedElements: balloon.text,

        numbers: resultNumbers,
        itemCodes: resultItemCodes,

        firstValue: resultValues[0],
        firstNumber: resultNumbers[0],
        firstItemCode: resultItemCodes[0],

        secondValue: resultValues[1],
        secondNumber: resultNumbers[1],
        secondItemCode: resultItemCodes[1],

        thirdValue: resultValues[2],
        thirdNumber: resultNumbers[2],
        thirdItemCode: resultItemCodes[2],

        // Include all elements for multi-element support
        allValues: resultValues,
        allNumbers: resultNumbers,
        allItemCodes: resultItemCodes
      });

    } else {
      // No balloon found for this component → "no flanges detected"
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
        thirdItemCode: "Not Found",
        allValues: [],
        allNumbers: [],
        allItemCodes: []
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
    
    if (r.relatedElements) {
      lines.push(`Related Elements: ${r.relatedElements}`);
    } else {
      lines.push(`Related Elements: no flanges detected`);
    }

    // Show all elements
    const elements = r.allValues && r.allValues.length > 0 
      ? r.allValues.filter(v => v !== null)
      : [r.firstValue, r.secondValue, r.thirdValue].filter(v => v !== null);
    
    if (elements.length > 0) {
      lines.push(`  Elements: ${elements.join(' : ')}`);
    }

    // Show element details
    if (r.allValues && r.allValues.length > 0) {
      for (let i = 0; i < r.allValues.length; i++) {
        const value = r.allValues[i];
        const number = r.allNumbers[i];
        const itemCode = r.allItemCodes[i];
        if (value) {
          lines.push(`  ${value} → PT.No: ${number !== null && number !== undefined ? number : 'Not Found'}`);
          lines.push(`    Item Code: ${itemCode}`);
        }
      }
    } else {
      // Backward compatibility for existing results
      if (r.firstValue) {
        lines.push(`  ${r.firstValue} → PT.No: ${r.firstNumber !== null ? r.firstNumber : 'Not Found'}`);
        lines.push(`    Item Code: ${r.firstItemCode}`);
      }
      if (r.secondValue) {
        lines.push(`  ${r.secondValue} → PT.No: ${r.secondNumber !== null ? r.secondNumber : 'Not Found'}`);
        lines.push(`    Item Code: ${r.secondItemCode}`);
      }
      if (r.thirdValue) {
        lines.push(`  ${r.thirdValue} → PT.No: ${r.thirdNumber !== null ? r.thirdNumber : 'Not Found'}`);
        lines.push(`    Item Code: ${r.thirdItemCode}`);
      }
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