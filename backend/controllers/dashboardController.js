const { pool } = require('../config/db');

/**
 * Get dashboard statistics
 */
exports.getStats = async (req, res) => {
  try {
    // Get total uploaded files
    const [totalFiles] = await pool.execute(
      'SELECT COUNT(*) as count FROM pdf_files'
    );

    // Get total analyzed files (completed status)
    const [analyzedFiles] = await pool.execute(
      "SELECT COUNT(*) as count FROM pdf_files WHERE upload_status = 'completed'"
    );

    // Get total components extracted
    const [totalComponents] = await pool.execute(
      'SELECT COUNT(*) as count FROM components'
    );

    // Get total matched items (matched + partial_match)
    const [matchedItems] = await pool.execute(
      "SELECT COUNT(*) as count FROM analysis_results WHERE match_status IN ('matched', 'partial_match')"
    );

    // Get total no-match items
    const [noMatchItems] = await pool.execute(
      "SELECT COUNT(*) as count FROM analysis_results WHERE match_status = 'no_match'"
    );

    // Get total analysis results
    const [totalResults] = await pool.execute(
      'SELECT COUNT(*) as count FROM analysis_results'
    );

    // Get recent upload history (last 5)
    const [recentUploads] = await pool.execute(
      'SELECT id, file_name, file_size, upload_status, uploaded_at FROM pdf_files ORDER BY uploaded_at DESC LIMIT 5'
    );

    return res.status(200).json({
      success: true,
      stats: {
        totalFiles: totalFiles[0].count,
        analyzedFiles: analyzedFiles[0].count,
        totalComponents: totalComponents[0].count,
        matchedItems: matchedItems[0].count,
        noMatchItems: noMatchItems[0].count,
        totalResults: totalResults[0].count
      },
      recentUploads: recentUploads
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: error.message
    });
  }
};

/**
 * Get upload history
 */
exports.getHistory = async (req, res) => {
  try {
    const [files] = await pool.execute(
      `SELECT pf.id, pf.file_name, pf.stored_file_name, pf.file_size, pf.upload_status, pf.uploaded_at,
              (SELECT COUNT(*) FROM components WHERE pdf_id = pf.id) as total_components,
              (SELECT COUNT(*) FROM analysis_results WHERE pdf_id = pf.id) as total_results,
              (SELECT COUNT(*) FROM analysis_results WHERE pdf_id = pf.id AND match_status IN ('matched', 'partial_match')) as total_matched
       FROM pdf_files pf
       ORDER BY pf.uploaded_at DESC`
    );

    return res.status(200).json({
      success: true,
      history: files
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch history',
      error: error.message
    });
  }
};