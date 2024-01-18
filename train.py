from ultralytics import YOLO


model = YOLO("yolov8x.pt")  # build a new model from scratch


results = model.train(data="data.yaml", epochs=100)  # train the model