const uploadService = require("../services/upload.service");

exports.initUpload = async (req, res) => {
  const { filename, totalSize, totalChunks } = req.body;
  if (!filename || !totalSize || !totalChunks) {
    return res.status(400).json({ message: "Invalid payload" });
  }

  try {
    const result = await uploadService.initUpload({
      filename,
      totalSize,
      totalChunks,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.uploadChunk = async (req, res) => {
  try {
    await uploadService.uploadChunk({
      uploadId: req.body.uploadId,
      chunkIndex: req.body.chunkIndex,
      buffer: req.file.buffer,
    });
    res.json({ message: "Chunk uploaded" });
  } catch (err) {
    res.status(500).json({ message: "Chunk upload failed" });
  }
};

exports.completeUpload = async (req, res) => {
  try {
    const result = await uploadService.finalizeUpload({
      uploadId: req.body.uploadId,
    });
    res.json({
      message: "Upload finalized",
      ...result,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
