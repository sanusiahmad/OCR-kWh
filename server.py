#server.py
from flask import Flask, request, jsonify, render_template
import os
from ftplib import FTP
import pika
import json
from datetime import datetime

app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'  # Anda perlu mengatur ini ke jalur folder yang sesuai
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


connection = pika.BlockingConnection(pika.ConnectionParameters('localhost'))
channel = connection.channel()
channel.queue_declare(queue='image_queue')

# FTP Configuration
FTP_SERVER = 'ftp5.pptik.id'
FTP_PORT = 2121
FTP_USERNAME = 'magangitg'
FTP_PASSWORD = 'bWFnYW5naXRn'
FTP_UPLOAD_DIR = '/OCR-kWh'


def send_message_to_rabbitmq(filename):
    try:
        # Menentukan username dan password RabbitMQ yang sesuai
        credentials = pika.PlainCredentials("sanusi", "12345")

        # Menggunakan credentials saat membuat koneksi ke RabbitMQ
        connection = pika.BlockingConnection(
            pika.ConnectionParameters("192.168.107.73", credentials=credentials)
        )
        channel = connection.channel()

        # Mendeklarasikan nama queue yang akan digunakan
        queue_name = "image_queue"

        # Mengirim pesan ke RabbitMQ
        channel.queue_declare(queue=queue_name)
        message = {"filename": filename}
        channel.basic_publish(
            exchange="", routing_key=queue_name, body=json.dumps(message)
        )

        connection.close()
        print("Pesan berhasil dikirim ke RabbitMQ")
    except Exception as e:
        print(f"Terjadi kesalahan saat mengirim pesan ke RabbitMQ: {str(e)}")



def upload_to_ftp(file, ftp_path, direktori=FTP_UPLOAD_DIR):
    try:
        ftp = FTP()
        ftp.connect(FTP_SERVER, FTP_PORT)
        ftp.login(FTP_USERNAME, FTP_PASSWORD)
        ftp.cwd(direktori)

        with open(file, "rb") as f:
            ftp.storbinary(f"STOR {ftp_path}", f)
        ftp.quit()
        return True
    except Exception as e:
        print(f"FTP upload error: {e}")
        return False


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload_file():
    
    if "file" not in request.files:
        return jsonify({"error": "No file part"})

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "No selected file"})
    if file:
        filename = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
        file.save(filename)
        send_message_to_rabbitmq(filename)  # Mengirim pesan ke RabbitMQ

        print(f"Uploaded file name: {file.filename}")
        current_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"Current date: {current_date}")

        # Mengunggah file ke FTP server
        ftp_path = file.filename
        if upload_to_ftp(filename, ftp_path):
            print(f"File uploaded to FTP server at: {ftp_path}")
        else:
            print("Failed to upload file to FTP server")

        return jsonify("succesfully")


if __name__ == "__main__":
    app.run(debug=True)
