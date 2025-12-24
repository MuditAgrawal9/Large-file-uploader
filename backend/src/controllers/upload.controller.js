const pool = require("../db/db");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const unzipper = require("unzipper");
const { Readable } = require("stream");

const UPLOAD_DIR = path.join(__dirname, "../../uploads");
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

// ================= ZIP VALIDATOR =================
function isValidZip(filePath) {
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(4);
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);

  const signature = buffer.toString("hex");
  return (
    signature === "504b0304" || // normal zip
    signature === "504b0506" || // empty zip
    signature === "504b0708" // spanned zip
  );
}

// ================= INIT UPLOAD =================
exports.initUpload = async (req, res) => {
  const { filename, totalSize, totalChunks } = req.body;

  if (!filename || !totalSize || !totalChunks) {
    return res.status(400).json({ message: "Invalid payload" });
  }

  try {
    const [existing] = await pool.query(
      "SELECT * FROM uploads WHERE filename=? AND total_size=?",
      [filename, totalSize]
    );

    let uploadId;

    if (existing.length > 0) {
      uploadId = existing[0].id;
    } else {
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

    return res.json({
      uploadId,
      uploadedChunks: chunks.map((c) => c.chunk_index),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= UPLOAD CHUNK =================
exports.uploadChunk = async (req, res) => {
  const { uploadId, chunkIndex } = req.body;
  const chunk = req.file;

  if (!uploadId || chunkIndex === undefined || !chunk) {
    return res.status(400).json({ message: "Invalid chunk payload" });
  }

  const chunkIdx = parseInt(chunkIndex, 10);
  const filePath = path.join(UPLOAD_DIR, uploadId);

  try {
    // 1️⃣ Try to CLAIM chunk (idempotency + locking)
    try {
      await pool.query(
        `INSERT INTO chunks (upload_id, chunk_index, status, received_at)
         VALUES (?, ?, 'RECEIVING', NOW())`,
        [uploadId, chunkIdx]
      );
    } catch (e) {
      // Duplicate = already claimed or written
      return res.json({ message: "Chunk already received" });
    }

    // 2️⃣ Ensure file exists
    if (!fs.existsSync(filePath)) {
      fs.closeSync(fs.openSync(filePath, "w"));
    }

    // 3️⃣ SAFE STREAM WRITE (ONE WRITER GUARANTEED)
    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath, {
        flags: "r+",
        start: chunkIdx * CHUNK_SIZE,
      });

      Readable.from(chunk.buffer)
        .pipe(writeStream)
        .on("finish", resolve)
        .on("error", reject);
    });

    // 4️⃣ Mark chunk as RECEIVED
    await pool.query(
      `UPDATE chunks 
       SET status='RECEIVED', received_at=NOW()
       WHERE upload_id=? AND chunk_index=?`,
      [uploadId, chunkIdx]
    );

    res.json({ message: "Chunk uploaded" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Chunk upload failed" });
  }
};


// ================= FINALIZE UPLOAD =================
exports.completeUpload = async (req, res) => {
  const { uploadId } = req.body;
  if (!uploadId) {
    return res.status(400).json({ message: "uploadId required" });
  }

  const filePath = path.join(UPLOAD_DIR, uploadId);
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 🔒 Lock row to prevent double-finalize
    const [uploads] = await conn.query(
      "SELECT * FROM uploads WHERE id=? FOR UPDATE",
      [uploadId]
    );

    if (uploads.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Upload not found" });
    }

    const upload = uploads[0];

    if (upload.status === "COMPLETED") {
      await conn.rollback();
      return res.json({
        message: "Already finalized",
        hash: upload.final_hash,
      });
    }

    // ✅ Ensure all chunks received
    const [[{ count }]] = await conn.query(
      "SELECT COUNT(*) AS count FROM chunks WHERE upload_id=? AND status='RECEIVED'",
      [uploadId]
    );

    if (count !== upload.total_chunks) {
      await conn.rollback();
      return res.status(400).json({ message: "Not all chunks uploaded" });
    }

    // 🔐 SHA-256 hash (streaming)
    const hash = crypto.createHash("sha256");
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .on("data", (d) => hash.update(d))
        .on("end", resolve)
        .on("error", reject);
    });
    const finalHash = hash.digest("hex");

    // 🛡 ZIP VALIDATION
    if (!isValidZip(filePath)) {
      await conn.rollback();
      return res.status(400).json({
        message: "Uploaded file is not a valid ZIP archive",
      });
    }

    // 📦 ZIP PEEK (STREAMING)
    const zipEntries = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(unzipper.Parse())
        .on("entry", (entry) => {
          zipEntries.push(entry.path);
          entry.autodrain();
        })
        .on("close", resolve)
        .on("error", reject);
    });

    // ✅ Final DB update
    await conn.query(
      "UPDATE uploads SET status='COMPLETED', final_hash=? WHERE id=?",
      [finalHash, uploadId]
    );

    await conn.commit();

    res.json({
      message: "Upload finalized",
      hash: finalHash,
      files: zipEntries,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: "Finalization failed" });
  } finally {
    conn.release();
  }
};
