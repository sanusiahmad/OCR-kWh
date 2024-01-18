import cv2
from ultralytics import YOLO
import easyocr
import pika
import json
import os
from pymongo import MongoClient
from datetime import datetime
from ftplib import FTP
from dotenv import load_dotenv

load_dotenv()

FTP_SERVER = os.getenv('FTP_SERVER')
FTP_PORT = int(os.getenv('FTP_PORT'))
FTP_USERNAME = os.getenv('FTP_USERNAME')
FTP_PASSWORD = os.getenv('FTP_PASSWORD')
FTP_UPLOAD_DIR = os.getenv('FTP_UPLOAD_DIR')
SAVE_DIR = 'hasil download'

RABBITMQ_HOST = os.getenv('RABBITMQ_HOST')
RABBITMQ_USERNAME = os.getenv('RABBITMQ_USERNAME')
RABBITMQ_PASSWORD = os.getenv('RABBITMQ_PASSWORD')

MONGODB_URI = os.getenv('DB_CONNECT')

def download_from_ftp(filename, directory=FTP_UPLOAD_DIR):
    local_dir = os.path.join(SAVE_DIR, os.path.basename(filename))
    try:
        with FTP() as ftp:
            ftp.connect(FTP_SERVER, FTP_PORT)
            ftp.login(FTP_USERNAME, FTP_PASSWORD)
            ftp.cwd(directory)
            file_size = ftp.size(filename)  # Check if the file exists
            print(f"File size on FTP server: {file_size}")
            with open(local_dir, 'wb') as f:
                ftp.retrbinary('RETR ' + os.path.basename(filename), f.write)
        return local_dir
    except Exception as e:
        print(f"FTP download error: {e}")
        return None



def process_image(filename, receipt):
    img = cv2.imread(filename)

    model = YOLO(r'runs\detect\train3\weights\best.pt')
    results = model(img)
    
    reader = easyocr.Reader(['en'])  

    # custom_oem_psm_config = r'--oem 3 --psm 8 outputbase digits'
    bounding_boxes_data = []

    for result in results:
        boxes = result.boxes.numpy()
        for box in boxes:
            r = box.xyxy[0].astype(int)
            cropped = img[r[1]:r[3], r[0]:r[2]]

            detected_numbers = reader.readtext(cropped)
            bounding_box = {
                "box": [int(val) for val in r],
                "hasil": detected_numbers[0][1]
            }
            bounding_boxes_data.append(bounding_box)

    # output_data = {
    #     "namafile": os.path.basename(filename),
    #     "boundingBoxes": bounding_boxes_data,
    #     "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    # }

    client = MongoClient(MONGODB_URI)
    db = client['magangitg']
    collection = db['kwh_ocrs']

    # Ubah status dokumen dan tambahkan data yang diperbarui
    result = collection.update_one(
        {"receipt": receipt},  
        {"$set": {
            "status": "Processed", 
            "updateAt": datetime.now(), 
            "boundingBoxes": bounding_boxes_data
            }}
    )

    if result.matched_count > 0:
        updated_data = collection.find_one({"receipt": receipt})
        json_output = json.dumps(updated_data, indent=4, default=str)
        print(f"Processed: {json_output}")
        return json_output
    else:
        print(f"Failed to update document with receipt: {receipt}")
        return None

def callback(ch, method, properties, body):
    message = json.loads(body.decode("utf-8"))
    filename = message["filename"]
    receipt = message["receipt"]

    local_filepath = download_from_ftp(filename)

    if local_filepath:
        result = process_image(local_filepath, receipt)
        print(f"Processed: {result}")
        os.remove(local_filepath)
    else:
        print(f"Failed to download: {local_filepath}")

if __name__ == "__main__":
    credentials = pika.PlainCredentials(RABBITMQ_USERNAME, RABBITMQ_PASSWORD)

    connection = pika.BlockingConnection(pika.ConnectionParameters(RABBITMQ_HOST, credentials=credentials))

    channel = connection.channel()
    queue_name = "image_queue"
    channel.queue_declare(queue=queue_name)

    channel.basic_consume(queue=queue_name, on_message_callback=callback, auto_ack=True)
    print("[*] Waiting for messages. To exit, press CTRL+C")
    channel.start_consuming()
