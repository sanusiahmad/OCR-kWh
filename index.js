// index.js
const express = require("express");
const amqp = require("amqplib/callback_api");
const fs = require("fs");
const multer = require("multer");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const uuid = require("uuid"); // Import the 'uuid' package

const app = express();
app.use(express.json());
app.use(bodyParser.json());

const UPLOAD_FOLDER = "D:/Kuliah/projek kp+magang/ocr/program7 js/uploads";
const FTP_SERVER = "ftp5.pptik.id";
const FTP_USERNAME = "magangitg";
const FTP_PASSWORD = "bWFnYW5naXRn";
const FTP_PORT = 2121;
const FTP_UPLOAD_DIR = "/Meteran_Air_Ocr";

// Konfigurasi koneksi MongoDB
const mongoURI =
  "mongodb://magangitg:bWFnYW5naXRn@database2.pptik.id:27017/?authMechanism=DEFAULT&authSource=magangitg"; // Ganti dengan URL MongoDB Anda
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;

db.on("error", (error) => {
  console.error("Koneksi MongoDB gagal: " + error);
});

db.once("open", () => {
  console.log("Koneksi MongoDB berhasil");
});

// Skema MongoDB
const dataSchema = new mongoose.Schema({
  nama: String,
  nomer: Number,
});

// Model berdasarkan skema
const Data = mongoose.model("Data", dataSchema);

// Fungsi untuk mengirim pesan ke RabbitMQ
function sendToRabbitMQ(filename) {
  amqp.connect("amqp://localhost", (err, connection) => {
    if (err) throw err;

    connection.createChannel((err, channel) => {
      if (err) throw err;

      const queueName = "file_processing_queue";
      channel.assertQueue(queueName, { durable: false });

      const message = { filename: filename };
      channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)));

      console.log("Pesan berhasil dikirim ke RabbitMQ");
    });
  });
}

// Fungsi untuk mengunggah file ke server FTP
function uploadToFTP(file_path, ftp_path, directory = FTP_UPLOAD_DIR) {
  const ftp = require("ftp");

  const client = new ftp();

  client.on("ready", () => {
    client.cwd(directory, (err) => {
      if (err) throw err;
      client.put(file_path, ftp_path, (err) => {
        if (err) throw err;
        client.end();
      });
    });
  });

  client.connect({
    host: FTP_SERVER,
    user: FTP_USERNAME,
    password: FTP_PASSWORD,
    port: FTP_PORT,
  });
}

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// Rute untuk menyimpan data ke MongoDB
app.post("/simpan-data", (req, res) => {
  const { nama, nomer } = req.body;
  const newData = new Data({ nama, nomer });

  newData.save((err) => {
    if (err) {
      console.error("Gagal menyimpan data: " + err);
      res.status(500).json({ error: "Gagal menyimpan data" });
    } else {
      console.log("Data berhasil disimpan");
      res.status(200).json({ message: "Data berhasil disimpan" });
    }
  });
});

// Rute untuk mengambil semua data dari MongoDB
app.get("/semua-data", (req, res) => {
  Data.find({}, (err, data) => {
    if (err) {
      console.error("Gagal mengambil data: " + err);
      res.status(500).json({ error: "Gagal mengambil data" });
    } else {
      res.status(200).json(data);
    }
  });
});

// Rute untuk mengunggah file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_FOLDER);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename using UUID
    const uniqueFilename = uuid.v4();
    cb(null, uniqueFilename);
  },
});

const upload = multer({ storage: storage });

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Tidak ada bagian file" });
  }

  const filename = req.file.originalname;
  const filePath = req.file.path;
  const ftpPath = "/" + filename;

  sendToRabbitMQ(filename);
  console.log(`Nama file yang diunggah: ${filename}`);

  uploadToFTP(filePath, ftpPath);

  res.json("sukses");
});

// Rute untuk memeriksa status file berdasarkan nama file
app.get("/cek-status/:filename", (req, res) => {
  const filename = req.params.filename;

  // Cari data dalam MongoDB berdasarkan nama file
  Data.findOne({ nama: filename }, (err, data) => {
    if (err) {
      console.error("Gagal memeriksa status: " + err);
      res.status(500).json({ error: "Gagal memeriksa status" });
    } else {
      if (data) {
        res.status(200).json({ status: "File sudah diproses" });
      } else {
        res.status(200).json({ status: "File belum diproses" });
      }
    }
  });
});

app.listen(3000, () => {
  console.log("Server berjalan di port 3000");
});
