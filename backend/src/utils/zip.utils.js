const fs = require("fs");
const unzipper = require("unzipper");

exports.isValidZip = (filePath) => {
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(4);
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);

  const signature = buffer.toString("hex");
  return ["504b0304", "504b0506", "504b0708"].includes(signature);
};

exports.peekZipEntries = async (filePath) => {
  const entries = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(unzipper.Parse())
      .on("entry", (entry) => {
        entries.push(entry.path);
        entry.autodrain();
      })
      .on("close", () => resolve(entries))
      .on("error", reject);
  });
};
