const path = require('path');

exports.checkDuplicate = async (req, res) => {
  try {
    const { fileName } = req.body;
    if (!fileName) {
      return res.json({ isDuplicate: false });
    }

    const db = req.app.locals.db;
    if (!db) {
      // If DB not available, skip duplicate check
      return res.json({ isDuplicate: false });
    }

    // Query DB for file with exact same file_name
    const [rows] = await db.query(
      'SELECT id, file_name, uploaded_at FROM pdf_files WHERE file_name = ? LIMIT 1',
      [fileName]
    );

    if (rows && rows.length > 0) {
      return res.json({
        isDuplicate: true,
        existingFile: {
          id: rows[0].id,
          file_name: rows[0].file_name,
          uploaded_at: rows[0].uploaded_at,
        },
      });
    }

    return res.json({ isDuplicate: false });
  } catch (err) {
    console.error('Duplicate check error:', err);
    // On error, allow upload to proceed
    return res.json({ isDuplicate: false });
  }
};