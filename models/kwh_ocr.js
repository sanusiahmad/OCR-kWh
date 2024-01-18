const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const time = require("moment");

const kwh_ocrSchema = new Schema({
  namafile: {
    type: String,
    required: true,
  },
  receipt: {
    type: String,
    required: true,
  },
  image_path: {
    type: String,
    required: false,
  },
  createAt: {
    type: String,
    default: () => time().format(),
  },
  updateAt: {
    type: String,
    default: () => time().format(),
  },
  status: {
    type: String,
    required: true,
  },
  boundingBoxes: [
    {
      box: [Number],
      hasil: String,
    },
  ],
});

const kwh_ocr = new mongoose.model("kwh_ocr", kwh_ocrSchema);

module.exports = kwh_ocr;
