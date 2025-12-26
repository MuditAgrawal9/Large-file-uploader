const pool = require("../db/db");
const path = require("path");
const crypto = require("crypto");

const { ensureFileExists, writeChunkAtOffset } = require("../utils/file.utils");
const { isValidZip, peekZipEntries } = require("../utils/zip.utils");

const UPLOAD_DIR = path.join(__dirname, "../../uploads");
const CHUNK_SIZE = 5 * 1024 * 1024;

// ================= INIT =================
exports.initUpload = async ({ filename, totalSize, totalChunks }) => {
  const [existing] = await pool.query(
    "SELECT * FROM uploads WHERE filename=? AND total_size=?",
    [filename, totalSize]
  );

  let uploadId;

  if (existing.length > 0) {
    uploadId = existing[0].id;
  } else {
    const { v4: uuidv4 } = require("uuid");
    uploadId = uuidv4();

    await pool.query(
      `INSERT INTO uploads 
       (id, filename, total_size, total_chunks, status)
       VALUES (?, ?, ?, ?, 'UPLOADING')`,
      [uploadId, filename, totalSize, totalChunks]
    );
  }

  const [chunks] = await pool.query(
    "SELECT chunk_index FROM chunks WHERE upload_id=? AND status='RECEIVED'",
    [uploadId]
  );

  return {
    uploadId,
    uploadedChunks: chunks.map((c) => c.chunk_index),
  };
};

// ================= CHUNK =================
exports.uploadChunk = async ({ uploadId, chunkIndex, buffer }) => {
  const chunkIdx = parseInt(chunkIndex, 10);
  const filePath = path.join(UPLOAD_DIR, uploadId);

  // Claim chunk (idempotent)
  try {
    await pool.query(
      `INSERT INTO chunks (upload_id, chunk_index, status, received_at)
       VALUES (?, ?, 'RECEIVING', NOW())`,
      [uploadId, chunkIdx]
    );
  } catch {
    return; // already received
  }

  ensureFileExists(filePath);

  await writeChunkAtOffset(filePath, buffer, chunkIdx * CHUNK_SIZE);

  await pool.query(
    `UPDATE chunks 
     SET status='RECEIVED', received_at=NOW()
     WHERE upload_id=? AND chunk_index=?`,
    [uploadId, chunkIdx]
  );
};

// ================= FINALIZE =================
exports.finalizeUpload = async ({ uploadId }) => {
  const conn = await pool.getConnection();
  const filePath = path.join(UPLOAD_DIR, uploadId);

  try {
    await conn.beginTransaction();

    const [uploads] = await conn.query(
      "SELECT * FROM uploads WHERE id=? FOR UPDATE",
      [uploadId]
    );

    if (uploads.length === 0) throw new Error("Upload not found");

    const upload = uploads[0];

    if (upload.status === "COMPLETED") {
      return { hash: upload.final_hash, files: [] };
    }

    const [[{ count }]] = await conn.query(
      "SELECT COUNT(*) AS count FROM chunks WHERE upload_id=? AND status='RECEIVED'",
      [uploadId]
    );

    if (count !== upload.total_chunks) {
      throw new Error("Not all chunks uploaded");
    }

    // SHA-256
    const hash = crypto.createHash("sha256");
    await new Promise((resolve, reject) => {
      require("fs")
        .createReadStream(filePath)
        .on("data", (d) => hash.update(d))
        .on("end", resolve)
        .on("error", reject);
    });

    const finalHash = hash.digest("hex");

    if (!isValidZip(filePath)) {
      throw new Error("Invalid ZIP archive");
    }

    const files = await peekZipEntries(filePath);

    await conn.query(
      "UPDATE uploads SET status='COMPLETED', final_hash=? WHERE id=?",
      [finalHash, uploadId]
    );

    await conn.commit();

    return { hash: finalHash, files };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
