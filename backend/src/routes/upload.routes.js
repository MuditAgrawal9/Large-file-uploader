const express = require("express");
const router = express.Router();
const multer = require("multer");

const {
  initUpload,
  uploadChunk,
  completeUpload,
} = require("../controllers/upload.controller");

const upload = multer({ storage: multer.memoryStorage() });

router.post("/init", initUpload);
router.post("/chunk", upload.single("chunk"), uploadChunk);
router.post("/complete", completeUpload);

module.exports = router;
