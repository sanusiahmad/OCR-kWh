const express = require('express');
const multer = require('multer');
const amqp = require('amqplib/callback_api');
const FTP = require('ftp');
const path = require('path');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

const mongoose = require('mongoose');
const kwh_ocr = require('./models/kwh_ocr.js');

// Set konfigurasi FTP
const FTP_CONFIG = {
  host: process.env.FTP_SERVER,
  port: process.env.FTP_PORT,
  user: process.env.FTP_USERNAME,
  password: process.env.FTP_PASSWORD,
};

const UPLOAD_FOLDER = 'uploads';
const OCR_KWH_FOLDER = 'OCR-kWh';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_FOLDER);
  },
  filename: (req, file, cb) => {
    const uniqueFilename = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueFilename);
  },
});

const upload = multer({ storage: storage });

function sendToRabbitMQ(filename, receipt) {
  amqp.connect(process.env.RABBITMQ_URL, (err, connection) => {
    if (err) {
      console.error(`Failed to connect to RabbitMQ: ${err}`);
      return;
    }
    connection.createChannel((err, channel) => {
      if (err) {
        console.error(`Failed to create channel: ${err}`);
        return;
      }

      const queue = 'image_queue';
      const message = JSON.stringify({ filename: filename, receipt: receipt });

      channel.assertQueue(queue, { durable: false });
      channel.sendToQueue(queue, Buffer.from(message));

      console.log("Pesan berhasil dikirim ke RabbitMQ");
    });
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    console.log('No file uploaded');
    res.json({ error: 'No file uploaded' });
    return;
  }

  const filename = req.file.filename;
  const currentDate = new Date();
  console.log(`Uploaded file name: ${filename}`);
  console.log(`Current date: ${currentDate}`);

  const document = new kwh_ocr({
    namafile: filename,
    receipt: filename,
    image_path: `uploads/${filename}`,
    createAt: currentDate,
    status: 'Uploading',
    updateAt: null,
    boundingBoxes: [],
  });

  try {
    const savedDocument = await document.save();
    console.log('Document saved:', savedDocument);

    // Upload the file to FTP server in the "OCR-kWh" directory
    const ftp = new FTP();
    ftp.on('ready', () => {
      ftp.cwd(OCR_KWH_FOLDER, (err) => {
        if (err) {
          console.error(`Failed to change directory on FTP server: ${err}`);
          ftp.end();
          return res.status(500).json({ error: 'Failed to change directory on FTP server' });
        }

        ftp.put(`uploads/${filename}`, filename, (err) => {
          if (err) {
            console.error(`Failed to upload file to FTP server: ${err}`);
            ftp.end();
            return res.status(500).json({ error: 'Failed to upload file to FTP server' });
          }

          console.log(`File ${filename} uploaded to FTP server in the "OCR-kWh" directory`);
          ftp.end();

          // Send a message to RabbitMQ to signal that the image is ready for processing
          sendToRabbitMQ(filename, savedDocument.receipt);

          console.log(`File ${filename} is ready for processing`);
          res.json({ message: 'File is ready for processing' });
        });
      });
    });

    ftp.connect(FTP_CONFIG);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create an entry in MongoDB' });
  }
});

app.get('/status/:receipt', async (req, res) => {
    const { receipt } = req.params;
  
    try {
      const document = await kwh_ocr.findOne({ receipt: receipt });
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
  
      res.json({ status: document.status, updatedAt: document.updateAt });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch document status from MongoDB' });
    }
  });  
  

mongoose.connect(process.env.DB_CONNECT).then(() => {
  console.log('Connected to MongoDB');
  app.listen(port, () => console.log(`Server is running on port ${port}`));
}).catch(err => {
  console.error(`Failed to connect to MongoDB: ${err}`);
});


  
 