const express = require("express");
const multer = require("multer");
const controller = require("../controllers/upload.controller");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/init", controller.initUpload);
router.post("/chunk", upload.single("chunk"), controller.uploadChunk);
router.post("/complete", controller.completeUpload);

module.exports = router;
