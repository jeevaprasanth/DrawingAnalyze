const { pool } = require('../config/db');

/**
 * Get analysis results for a specific file
 */
exports.getResults = async (req, res) => {
  try {
    const { fileId } = req.params;

    // Verify file exists
    const [files] = await pool.execute(
      'SELECT id, file_name, upload_status FROM pdf_files WHERE id = ?',
      [fileId]
    );

    if (files.length === 0) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Get analysis results including bounding box coordinates for zoom functionality
    const [results] = await pool.execute(
      `SELECT id, component, element, item_code, description, match_status, confidence_score, remarks, created_at, 
              related_elements, first_element_value, extracted_number,
              second_element_value, second_extracted_number, second_item_code,
              third_element_value, third_extracted_number, third_item_code,
              page_number, bbox_x, bbox_y, bbox_width, bbox_height
       FROM analysis_results WHERE pdf_id = ? ORDER BY id ASC`,
      [fileId]
    );

    return res.status(200).json({
      success: true,
      file: files[0],
      results: results,
      found: results.length > 0
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch results',
      error: error.message
    });
  }
};

/**
 * Get all results across all files (for admin/history)
 */
exports.getAllResults = async (req, res) => {
  try {
    const [results] = await pool.execute(`
      SELECT ar.id, ar.component, ar.element, ar.item_code, ar.description, 
             ar.match_status, ar.confidence_score, ar.created_at,
             ar.related_elements, ar.first_element_value, ar.extracted_number,
             ar.second_element_value, ar.second_extracted_number, ar.second_item_code,
             ar.third_element_value, ar.third_extracted_number, ar.third_item_code,
             pf.file_name
      FROM analysis_results ar
      JOIN pdf_files pf ON ar.pdf_id = pf.id
      ORDER BY pf.file_name ASC, ar.id ASC
    `);

    return res.status(200).json({
      success: true,
      results: results
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch all results',
      error: error.message
    });
  }
};

/**
 * Export results for selected file IDs
 * POST /api/results/export/selected
 * Body: { fileIds: [1, 2, 3] }
 */
exports.exportSelectedResults = async (req, res) => {
  try {
    const { fileIds } = req.body;
    
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No file IDs provided' });
    }

    // Build placeholders for IN clause
    const placeholders = fileIds.map(() => '?').join(',');
    const [results] = await pool.execute(
      `SELECT ar.id, ar.component, ar.match_status,
             ar.related_elements,
             ar.first_element_value, ar.extracted_number, ar.item_code as first_item_code,
             ar.second_element_value, ar.second_extracted_number, ar.second_item_code,
             ar.third_element_value, ar.third_extracted_number, ar.third_item_code,
             pf.file_name, pf.uploaded_at
      FROM analysis_results ar
      JOIN pdf_files pf ON ar.pdf_id = pf.id
      WHERE pf.id IN (${placeholders})
      ORDER BY pf.file_name ASC, ar.id ASC`,
      fileIds
    );

    // Transform into flat format for Excel
    const exportData = results.map(r => ({
      'FILE NAME': r.file_name,
      'UPLOAD DATE': r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : '',
      'JOINT NUMBER': r.component,
      'RELATED FLANGES': r.related_elements || '',
      'FIRST FLANGE NO': r.first_element_value || '',
      'FIRST PART NUMBER': r.extracted_number !== null && r.extracted_number !== undefined ? r.extracted_number : '',
      'FIRST ME CODE': r.first_item_code || 'Not Found',
      'SECOND FLANGE NO': r.second_element_value || '',
      'SECOND PART NUMBER': r.second_extracted_number !== null && r.second_extracted_number !== undefined ? r.second_extracted_number : '',
      'SECOND ME CODE': r.second_item_code || '',
      'THIRD FLANGE NO': r.third_element_value || '',
      'THIRD PART NUMBER': r.third_extracted_number !== null && r.third_extracted_number !== undefined ? r.third_extracted_number : '',
      'THIRD ME CODE': r.third_item_code || '',
      'MATCH STATUS': r.match_status
    }));

    return res.status(200).json({
      success: true,
      exportData: exportData
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to export selected results',
      error: error.message
    });
  }
};

/**
 * Smart Search - Search across all components, part numbers, and ME codes
 * GET /api/results/search?q=<search_term>
 */
exports.searchResults = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    const searchTerm = `%${q.trim()}%`;
    
    // Search across component (joint number), part numbers, and ME codes
    const [results] = await pool.execute(`
      SELECT 
        ar.id, ar.component, ar.element, ar.item_code, ar.description,
        ar.match_status, ar.confidence_score, ar.created_at,
        ar.related_elements, ar.first_element_value, ar.extracted_number,
        ar.second_element_value, ar.second_extracted_number, ar.second_item_code,
        ar.third_element_value, ar.third_extracted_number, ar.third_item_code,
        pf.file_name, pf.id as file_id
      FROM analysis_results ar
      JOIN pdf_files pf ON ar.pdf_id = pf.id
      WHERE 
        ar.component LIKE ?
        OR ar.extracted_number LIKE ?
        OR ar.second_extracted_number LIKE ?
        OR ar.third_extracted_number LIKE ?
        OR ar.item_code LIKE ?
        OR ar.second_item_code LIKE ?
        OR ar.third_item_code LIKE ?
        OR ar.first_element_value LIKE ?
        OR ar.second_element_value LIKE ?
        OR ar.third_element_value LIKE ?
      ORDER BY pf.file_name ASC, ar.id ASC
      LIMIT 50
    `, [
      searchTerm, searchTerm, searchTerm, searchTerm,
      searchTerm, searchTerm, searchTerm,
      searchTerm, searchTerm, searchTerm
    ]);

    return res.status(200).json({
      success: true,
      query: q.trim(),
      results: results,
      count: results.length
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error.message
    });
  }
};

/**
 * Export all results as a flat array suitable for Excel/CSV export
 */
exports.exportAllResults = async (req, res) => {
  try {
    const [results] = await pool.execute(`
      SELECT ar.id, ar.component, ar.match_status,
             ar.related_elements,
             ar.first_element_value, ar.extracted_number, ar.item_code as first_item_code,
             ar.second_element_value, ar.second_extracted_number, ar.second_item_code,
             ar.third_element_value, ar.third_extracted_number, ar.third_item_code,
             pf.file_name, pf.uploaded_at
      FROM analysis_results ar
      JOIN pdf_files pf ON ar.pdf_id = pf.id
      ORDER BY pf.file_name ASC, ar.id ASC
    `);

    // Transform into flat format for Excel
    const exportData = results.map(r => ({
      'FILE NAME': r.file_name,
      'UPLOAD DATE': r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : '',
      'JOINT NUMBER': r.component,
      'RELATED FLANGES': r.related_elements || '',
      'FIRST FLANGE NO': r.first_element_value || '',
      'FIRST PART NUMBER': r.extracted_number !== null && r.extracted_number !== undefined ? r.extracted_number : '',
      'FIRST ME CODE': r.first_item_code || 'Not Found',
      'SECOND FLANGE NO': r.second_element_value || '',
      'SECOND PART NUMBER': r.second_extracted_number !== null && r.second_extracted_number !== undefined ? r.second_extracted_number : '',
      'SECOND ME CODE': r.second_item_code || '',
      'THIRD FLANGE NO': r.third_element_value || '',
      'THIRD PART NUMBER': r.third_extracted_number !== null && r.third_extracted_number !== undefined ? r.third_extracted_number : '',
      'THIRD ME CODE': r.third_item_code || '',
      'MATCH STATUS': r.match_status
    }));

    return res.status(200).json({
      success: true,
      exportData: exportData
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to export results',
      error: error.message
    });
  }
};