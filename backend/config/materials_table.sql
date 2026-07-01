-- ============================================================
-- COMPLETE DATABASE SCHEMA & QUERIES
-- Engineering Drawing Analyzer
-- ============================================================

-- ============================================================
-- TABLE 1: pdf_files - Stores uploaded PDF metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS pdf_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  stored_file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  upload_status ENUM('uploaded', 'analyzing', 'completed', 'failed') DEFAULT 'uploaded',
  total_components INT DEFAULT 0,
  total_results INT DEFAULT 0,
  total_matched INT DEFAULT 0,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (upload_status),
  INDEX idx_uploaded_at (uploaded_at)
);

-- ============================================================
-- TABLE 2: components - Stores extracted F-XXXX components
-- ============================================================
CREATE TABLE IF NOT EXISTS components (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pdf_id INT NOT NULL,
  component_name VARCHAR(50) NOT NULL,
  page_number INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pdf_id) REFERENCES pdf_files(id) ON DELETE CASCADE,
  INDEX idx_pdf_id (pdf_id),
  INDEX idx_component_name (component_name)
);

-- ============================================================
-- TABLE 3: elements - Stores related elements for each component
-- ============================================================
CREATE TABLE IF NOT EXISTS elements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  component_id INT NOT NULL,
  element_raw TEXT,
  first_element VARCHAR(50),
  value1 VARCHAR(50),
  value2 VARCHAR(50),
  value3 VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE,
  INDEX idx_component_id (component_id)
);

-- ============================================================
-- TABLE 4: analysis_results - Stores final matched results
-- ============================================================
CREATE TABLE IF NOT EXISTS analysis_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pdf_id INT NOT NULL,
  component VARCHAR(50) NOT NULL,
  element VARCHAR(50),
  item_code VARCHAR(100),
  description TEXT,
  match_status ENUM('matched', 'no_match', 'partial_match') DEFAULT 'no_match',
  confidence_score INT DEFAULT 0,
  remarks TEXT,
  related_elements VARCHAR(255),
  first_element_value VARCHAR(50),
  extracted_number INT,
  second_element_value VARCHAR(50),
  second_extracted_number INT,
  second_item_code VARCHAR(100),
  third_element_value VARCHAR(50),
  third_extracted_number INT,
  third_item_code VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pdf_id) REFERENCES pdf_files(id) ON DELETE CASCADE,
  INDEX idx_pdf_id (pdf_id),
  INDEX idx_component (component),
  INDEX idx_match_status (match_status)
);

-- ============================================================
-- TABLE 5: materials - Stores PT.No → Item Code mappings
-- ============================================================
CREATE TABLE IF NOT EXISTS materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pdf_id INT NOT NULL,
  pt_no INT NOT NULL COMMENT 'PT.No column value (1-999)',
  item_code VARCHAR(100) NOT NULL COMMENT 'Item Code column value',
  description TEXT COMMENT 'Description column (optional)',
  npd_in VARCHAR(20) COMMENT 'NPD(IN) column (optional)',
  quantity INT COMMENT 'QTY column (optional)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pdf_id) REFERENCES pdf_files(id) ON DELETE CASCADE,
  UNIQUE KEY unique_pt_per_pdf (pdf_id, pt_no),
  INDEX idx_pt_no (pt_no),
  INDEX idx_item_code (item_code)
);

-- ============================================================
-- SAMPLE DATA INSERTION (from reference PDF)
-- ============================================================
-- INSERT INTO materials (pdf_id, pt_no, item_code, description) VALUES
--   (1, 25, 'PFY2ADRTAMZZACQADH', 'FLG WNRF 1 1/2" A105N SOUR XS, 150# 125 B16.5'),
--   (1, 26, 'PFY2ADRT03ZZACPADH', 'FLG WNRF 3" A105N SOUR STD, 150# 125 B16.5'),
--   (1, 27, 'PFY2ADRT24ZZACPADH', 'FLG WNRF 24" A105N SOUR STD, 150# 125 B16.5'),
--   (1, 31, 'PGUUB5RT03AIAAAZZC', 'GSK SPR WND W/CS CENTERING RING + I - SS 3" 4.50 MM THICK 150# B16.20'),
--   (1, 32, 'PGUUB5RT24AIAAAZZC', 'GSK SPR WND W/CS CENTERING RING + I - SS 24" 4.50 MM THICK 150# B16.20'),
--   (1, 35, 'PH8ASCRTAF00100ZZF', 'BOLT STUD+2 NUTS A193 GR B7M/A194 GR 2HM 100mm'),
--   (1, 36, 'PH8ASCRTAK00190ZZF', 'BOLT STUD+2 NUTS A193 GR B7M/A194 GR 2HM 190mm');

-- ============================================================
-- ALL DATABASE QUERIES
-- ============================================================

-- -------------------------------------------------------
-- PDF FILES QUERIES
-- -------------------------------------------------------

-- Insert a new PDF file record
INSERT INTO pdf_files (file_name, stored_file_name, file_path, file_size, upload_status)
VALUES (?, ?, ?, ?, ?);

-- Get all uploaded files (for history page)
SELECT id, file_name, file_size, upload_status, total_components, total_results, total_matched, uploaded_at
FROM pdf_files ORDER BY uploaded_at DESC;

-- Get a single file by ID
SELECT id, file_name, upload_status FROM pdf_files WHERE id = ?;

-- Get all file paths (for delete all)
SELECT file_path FROM pdf_files;

-- Update file status to analyzing
UPDATE pdf_files SET upload_status = 'analyzing' WHERE id = ?;

-- Update file status to completed
UPDATE pdf_files SET upload_status = 'completed' WHERE id = ?;

-- Update file status to failed
UPDATE pdf_files SET upload_status = 'failed' WHERE id = ?;

-- Update file with component counts
UPDATE pdf_files SET total_components = ?, total_results = ?, total_matched = ? WHERE id = ?;

-- Delete a single file record
DELETE FROM pdf_files WHERE id = ?;

-- Delete all file records
DELETE FROM pdf_files;

-- -------------------------------------------------------
-- COMPONENTS QUERIES
-- -------------------------------------------------------

-- Insert a new component
INSERT INTO components (pdf_id, component_name, page_number) VALUES (?, ?, ?);

-- Get components for a PDF
SELECT id, component_name FROM components WHERE pdf_id = ? ORDER BY id ASC;

-- Get total component count for a PDF
SELECT COUNT(*) as total FROM components WHERE pdf_id = ?;

-- Delete components for a PDF
DELETE FROM components WHERE pdf_id = ?;

-- -------------------------------------------------------
-- ELEMENTS QUERIES
-- -------------------------------------------------------

-- Insert element data
INSERT INTO elements (component_id, element_raw, first_element, value1, value2, value3)
VALUES (?, ?, ?, ?, ?, ?);

-- Get elements for a component
SELECT * FROM elements WHERE component_id = ?;

-- -------------------------------------------------------
-- ANALYSIS RESULTS QUERIES
-- -------------------------------------------------------

-- Insert analysis result (with all 3 element values and item codes)
INSERT INTO analysis_results
  (pdf_id, component, element, item_code, description, match_status, confidence_score, remarks,
   related_elements, first_element_value, extracted_number,
   second_element_value, second_extracted_number, second_item_code,
   third_element_value, third_extracted_number, third_item_code)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- Get results for a specific file (for Results page)
SELECT id, component, element, item_code, description, match_status, confidence_score, remarks, created_at,
       related_elements, first_element_value, extracted_number,
       second_element_value, second_extracted_number, second_item_code,
       third_element_value, third_extracted_number, third_item_code
FROM analysis_results WHERE pdf_id = ? ORDER BY id ASC;

-- Get all results across all files (for overall export)
SELECT ar.id, ar.component, ar.element, ar.item_code, ar.description,
       ar.match_status, ar.confidence_score, ar.created_at,
       ar.related_elements, ar.first_element_value, ar.extracted_number,
       ar.second_element_value, ar.second_extracted_number, ar.second_item_code,
       ar.third_element_value, ar.third_extracted_number, ar.third_item_code,
       pf.file_name
FROM analysis_results ar
JOIN pdf_files pf ON ar.pdf_id = pf.id
ORDER BY pf.file_name ASC, ar.id ASC;

-- Get results for selected file IDs (for selected export)
SELECT ar.id, ar.component, ar.match_status,
       ar.related_elements,
       ar.first_element_value, ar.extracted_number, ar.item_code as first_item_code,
       ar.second_element_value, ar.second_extracted_number, ar.second_item_code,
       ar.third_element_value, ar.third_extracted_number, ar.third_item_code,
       pf.file_name, pf.uploaded_at
FROM analysis_results ar
JOIN pdf_files pf ON ar.pdf_id = pf.id
WHERE pf.id IN (?)
ORDER BY pf.file_name ASC, ar.id ASC;

-- Get result count for a PDF
SELECT COUNT(*) as total FROM analysis_results WHERE pdf_id = ?;

-- Get matched count for a PDF
SELECT COUNT(*) as total FROM analysis_results WHERE pdf_id = ? AND match_status = 'matched';

-- Delete results for a PDF
DELETE FROM analysis_results WHERE pdf_id = ?;

-- -------------------------------------------------------
-- MATERIALS TABLE QUERIES
-- -------------------------------------------------------

-- Insert a material mapping
INSERT INTO materials (pdf_id, pt_no, item_code, description, npd_in, quantity)
VALUES (?, ?, ?, ?, ?, ?);

-- Get all material mappings for a PDF (used by buildMaterialMap)
SELECT pt_no, item_code FROM materials WHERE pdf_id = ? ORDER BY pt_no;

-- Lookup a single Item Code by PT.No (for element matching)
SELECT item_code FROM materials WHERE pdf_id = ? AND pt_no = ?;

-- Get complete materials table for a PDF
SELECT pt_no, item_code, description, npd_in, quantity
FROM materials WHERE pdf_id = ? ORDER BY pt_no ASC;

-- Check if a specific PT.No exists
SELECT COUNT(*) as exists_flag FROM materials WHERE pdf_id = ? AND pt_no = ?;

-- Delete material mappings for a PDF
DELETE FROM materials WHERE pdf_id = ?;

-- -------------------------------------------------------
-- DASHBOARD STATS QUERIES
-- -------------------------------------------------------

-- Get dashboard summary stats
SELECT
  (SELECT COUNT(*) FROM pdf_files) as total_files,
  (SELECT COUNT(*) FROM pdf_files WHERE upload_status = 'completed') as completed_files,
  (SELECT COUNT(*) FROM analysis_results) as total_components,
  (SELECT COUNT(*) FROM analysis_results WHERE match_status = 'matched') as total_matched,
  (SELECT COUNT(*) FROM analysis_results WHERE match_status = 'no_match') as total_unmatched;

-- Get recent uploads (last 5)
SELECT id, file_name, file_size, upload_status, uploaded_at
FROM pdf_files ORDER BY uploaded_at DESC LIMIT 5;

-- -------------------------------------------------------
-- DELETE QUERIES
-- -------------------------------------------------------

-- Delete single file and all related data (cascade)
DELETE FROM pdf_files WHERE id = ?;

-- Delete all files and all related data (cascade)
DELETE FROM pdf_files;