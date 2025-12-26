const fs = require("fs");
const { Readable } = require("stream");

exports.ensureFileExists = (filePath) => {
  if (!fs.existsSync(filePath)) {
    fs.closeSync(fs.openSync(filePath, "w"));
  }
};

exports.writeChunkAtOffset = (filePath, buffer, offset) => {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath, {
      flags: "r+",
      start: offset,
    });

    Readable.from(buffer)
      .pipe(writeStream)
      .on("finish", resolve)
      .on("error", reject);
  });
};
