const express = require("express");
const app = express();

const cors = require("cors");
app.use(cors()); 
app.use(express.json());

app.use("/upload", require("./routes/upload.routes"));

app.listen(4000, () => {
  console.log("Backend running on port 4000");
});
