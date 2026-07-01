const { pool } = require('../config/db');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

/**
 * Run the component extractor as a child process (ESM) and get JSON results
 * Extracts only components in range F-1000 to F-1999 with their related elements and item codes
 * @param {string} pdfPath - Absolute path to PDF file
 * @returns {Promise<Array>} Array of analysis result objects, or empty array if within range but none found
 */
function runComponentExtractor(pdfPath) {
  return new Promise((resolve, reject) => {
    const analyzerScript = path.join(__dirname, '..', 'utils', 'runComponentExtractor.mjs');
    const child = spawn('node', [analyzerScript, pdfPath], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          const parsed = JSON.parse(stdout);
          // Handle the {"error":"Components Not Found"} response
          if (parsed && parsed.error === 'Components Not Found') {
            resolve([]);
          } else if (Array.isArray(parsed)) {
            resolve(parsed);
          } else {
            // Unexpected format, treat as no results
            console.warn(`Component extractor returned unexpected format: ${stdout.substring(0, 200)}`);
            resolve([]);
          }
        } catch (e) {
          reject(new Error(`Failed to parse component extractor output: ${e.message}`));
        }
      } else {
        console.warn(`Component extractor failed (code ${code}): ${stderr}.`);
        resolve([]);
      }
    });

    child.on('error', (err) => {
      console.warn(`Component extractor error: ${err.message}.`);
      resolve([]);
    });
  });
}

/**
 * Process a single PDF file: analyze and save results to DB
 * @param {Object} file - Multer file object
 * @returns {Object} Processing result
 */
async function processSinglePDF(file) {
  const filePath = file.path;
  const fileId = file._dbId; // Set by caller after DB insertion

  try {
    // Use component extractor (F-1000 to F-1999 only)
    let extractorResults = await runComponentExtractor(filePath);

    let analysisResults = [];

    if (extractorResults && extractorResults.length > 0) {
      // Components found in F-1000 to F-1999 range
      for (const result of extractorResults) {
        const firstItemCode = result.firstItemCode || null;
        const secondItemCode = result.secondItemCode || null;
        const thirdItemCode = result.thirdItemCode || null;
        
        const hasAnyMatch = firstItemCode || secondItemCode || thirdItemCode;
        const matchStatus = hasAnyMatch ? 'matched' : 'no_match';
        const confidenceScore = hasAnyMatch ? 100 : 0;

        // Save component
        const [compResult] = await pool.execute(
          'INSERT INTO components (pdf_id, component_name, page_number) VALUES (?, ?, ?)',
          [fileId, result.component, 1]
        );

        // Save element with all three values
        await pool.execute(
          'INSERT INTO elements (component_id, element_raw, first_element, value1, value2, value3) VALUES (?, ?, ?, ?, ?, ?)',
          [compResult.insertId, result.relatedElements || '', result.firstValue || '', result.firstValue, result.secondValue, result.thirdValue]
        );

        // Save analysis result with all three values, item codes, and full material row data
        await pool.execute(
          `INSERT INTO analysis_results 
            (pdf_id, component, element, item_code, description, match_status, confidence_score, remarks, 
             related_elements, first_element_value, extracted_number,
             second_element_value, second_extracted_number, second_item_code,
             third_element_value, third_extracted_number, third_item_code) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fileId,
            result.component,
            result.firstValue,
            firstItemCode,
            result.firstDescription || null,  // Full Description from materials table row
            matchStatus,
            confidenceScore,
            hasAnyMatch ? 'Matched from material description table' : 'No matching material entry found',
            result.relatedElements,
            result.firstValue,
            result.firstNumber,
            result.secondValue,
            result.secondNumber,
            secondItemCode,
            result.thirdValue,
            result.thirdNumber,
            thirdItemCode
          ]
        );

        analysisResults.push({
          component: result.component,
          element: result.firstValue,
          item_code: firstItemCode || 'Not Found',
          description: null,
          match_status: matchStatus,
          confidence_score: confidenceScore,
          remarks: hasAnyMatch ? 'Matched from material description table' : 'No matching material entry found',
          related_elements: result.relatedElements,
          first_element_value: result.firstValue,
          extracted_number: result.firstNumber,
          second_element_value: result.secondValue,
          second_extracted_number: result.secondNumber,
          second_item_code: secondItemCode,
          third_element_value: result.thirdValue,
          third_extracted_number: result.thirdNumber,
          third_item_code: thirdItemCode
        });
      }
    } else {
      // No components found in F-1000 to F-1999 range
      console.log(`No F-1000 to F-1999 components found in ${file.originalname}.`);
    }

    return { success: true, analysisResults, fileName: file.originalname };

  } catch (analysisError) {
    console.error(`Analysis error for ${file.originalname}:`, analysisError);
    return { success: false, error: analysisError.message, fileName: file.originalname };
  }
}

/**
 * Upload up to 50 PDF files and auto-analyze them using spatial analysis
 * Expects multipart/form-data with field name "pdfs" containing an array of files
 */
exports.uploadPDF = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const files = req.files;
    
    if (files.length > 50) {
      return res.status(400).json({ success: false, message: 'Maximum 50 files allowed at a time' });
    }

    // First, insert all file records into database
    const fileRecords = [];
    for (const file of files) {
      const [fileResult] = await pool.execute(
        'INSERT INTO pdf_files (file_name, stored_file_name, file_path, file_size, upload_status) VALUES (?, ?, ?, ?, ?)',
        [file.originalname, file.filename, file.path, file.size, 'analyzing']
      );
      file._dbId = fileResult.insertId;
      fileRecords.push({
        id: fileResult.insertId,
        originalName: file.originalname,
        dbId: fileResult.insertId
      });
    }

    // Process each file sequentially
    const allResults = [];
    let totalComponents = 0;
    let totalMatched = 0;
    let failedFiles = [];
    const successfulFileIds = [];

    for (const file of files) {
      const processResult = await processSinglePDF(file);
      
      if (processResult.success) {
        allResults.push(...processResult.analysisResults);
        totalComponents += processResult.analysisResults.length;
        totalMatched += processResult.analysisResults.filter(r => r.match_status === 'matched').length;
        successfulFileIds.push(file._dbId);
        
        // Update file status to completed
        await pool.execute(
          'UPDATE pdf_files SET upload_status = ? WHERE id = ?',
          ['completed', file._dbId]
        );
      } else {
        failedFiles.push({
          fileName: file.originalname,
          error: processResult.error
        });
        
        // Update file status to failed
        await pool.execute(
          'UPDATE pdf_files SET upload_status = ? WHERE id = ?',
          ['failed', file._dbId]
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: `Processed ${files.length} file(s). ${failedFiles.length > 0 ? `${failedFiles.length} failed.` : 'All successful.'}`,
      summary: {
        totalFiles: files.length,
        successfulFiles: files.length - failedFiles.length,
        failedFiles: failedFiles.length,
        totalComponents: totalComponents,
        totalMatched: totalMatched,
        failedFiles: failedFiles
      },
      fileIds: successfulFileIds,
      results: allResults
    });

  } catch (error) {
    console.error('Upload error details:', error);
    
    // Update any files that were in 'analyzing' status to 'failed'
    if (req.files) {
      for (const file of req.files) {
        if (file._dbId) {
          try {
            await pool.execute(
              'UPDATE pdf_files SET upload_status = ? WHERE id = ?',
              ['failed', file._dbId]
            );
          } catch (dbError) {
            console.error('Failed to update status:', dbError);
          }
        }
      }
    }

    return res.status(500).json({
      success: false,
      message: 'File upload failed',
      error: error.message
    });
  }
};

/**
 * Get all uploaded files
 */
exports.getFiles = async (req, res) => {
  try {
    const [files] = await pool.execute(
      'SELECT id, file_name, file_size, upload_status, uploaded_at FROM pdf_files ORDER BY uploaded_at DESC'
    );

    return res.status(200).json({
      success: true,
      files: files
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch files',
      error: error.message
    });
  }
};

/**
 * Delete uploaded file and related data
 */
/**
 * Delete all uploaded files and all related analysis data
 */
exports.deleteAllFiles = async (req, res) => {
  try {
    // Get all file records to delete physical files
    const [files] = await pool.execute(
      'SELECT file_path FROM pdf_files'
    );

    // Delete physical files
    for (const file of files) {
      if (file.file_path && fs.existsSync(file.file_path)) {
        fs.unlinkSync(file.file_path);
      }
    }

    // Delete all records from DB (cascading deletes will handle related data)
    await pool.execute('DELETE FROM pdf_files');

    return res.status(200).json({
      success: true,
      message: 'All files and related data deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete all files',
      error: error.message
    });
  }
};

/**
 * Delete uploaded file and related data
 */
exports.deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file record
    const [files] = await pool.execute(
      'SELECT file_path FROM pdf_files WHERE id = ?',
      [fileId]
    );

    if (files.length === 0) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Delete physical file
    const filePath = files[0].file_path;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database (cascade will delete related records)
    await pool.execute('DELETE FROM pdf_files WHERE id = ?', [fileId]);

    return res.status(200).json({
      success: true,
      message: 'File and related data deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete file',
      error: error.message
    });
  }
};