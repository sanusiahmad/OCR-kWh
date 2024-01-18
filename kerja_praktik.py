from flask import Flask, request, jsonify, render_template
import os
from ultralytics import YOLO
import cv2
import easyocr
import json
import numpy as np
from pymongo import MongoClient

app = Flask(__name__)


client = MongoClient('mongodb://localhost:27017/')
db = client['kWh']  
collection = db['OCR_kWh'] 

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return super(NumpyEncoder, self).default(obj)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'})
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected for uploading'})
    
    if not os.path.exists('uploads'):
        os.makedirs('uploads')
    
    image_path = os.path.join('uploads', file.filename)
    file.save(image_path)


    model = YOLO(r'runs\detect\train3\weights\best.pt')
    results = model(image_path)
    img = cv2.imread(image_path)

    reader = easyocr.Reader(['en']) 
    
    bounding_boxes = []

    for result in results:
        boxes = result.boxes.numpy()
        for box in boxes:
            r = box.xyxy[0].astype(int)
            r = [int(val) for val in r]
            # bb = cv2.rectangle(img, r[:2], r[2:], (0, 255, 0), 2)
            
            cropped = img[r[1]:r[3], r[0]:r[2]]
            cv2.imwrite("hasil.jpg", cropped)

            detected_numbers = reader.readtext(cropped)


            if detected_numbers:
                numeric_value = detected_numbers[0][1]
                accuracy = detected_numbers[0][2]

                bounding_boxes.append({
                    "box": r,
                    "hasil": numeric_value,
                    "Confidence": accuracy
                })


    document = {
        "namafile": os.path.basename(image_path),
        "boundingBoxes": bounding_boxes
    }


    result = collection.insert_one(document)
    print(f"Data berhasil disimpan dengan ID: {result.inserted_id}")


    output_data = {
        "namafile": os.path.basename(image_path),
        "boundingBoxes": bounding_boxes
    }

    json_output = json.dumps(output_data, indent=4, cls=NumpyEncoder)
    print(json_output)

    return jsonify(output_data)

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)


