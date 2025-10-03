# app.py
from flask import Flask, request, Response
from flask_cors import CORS  # Make sure this is imported
import cv2
import threading
import time
import logging

app = Flask(__name__)

# UPDATED: Configure CORS to specifically allow your frontend's origin.
CORS(app, resources={r"/*": {"origins": "http://localhost:8080"}})

# --- Global State ---
app_state = {
    "capture_thread": None,
    "video_capture": None,
    "output_frame": None,
    "lock": threading.Lock(),
    "shutdown_flag": threading.Event()
}

logging.basicConfig(level=logging.INFO)

def video_stream_loop():
    """Reads frames from the video source and stores the latest one."""
    global app_state
    
    while not app_state["shutdown_flag"].is_set():
        if app_state["video_capture"]:
            success, frame = app_state["video_capture"].read()
            if success:
                ret, buffer = cv2.imencode('.jpg', frame)
                if ret:
                    with app_state["lock"]:
                        app_state["output_frame"] = buffer.tobytes()
            else:
                logging.warning("Failed to read frame from source. Retrying...")
                time.sleep(2)
        time.sleep(1/30)

    logging.info("Video stream loop has stopped.")


def generate_frames():
    """A generator function that yields frames for the video stream."""
    global app_state
    while True:
        with app_state["lock"]:
            if app_state["output_frame"] is None:
                continue
            frame_bytes = app_state["output_frame"]

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        time.sleep(1/30)

@app.route("/video_feed")
def video_feed():
    """The video streaming route."""
    return Response(generate_frames(),
                    mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/start_stream", methods=["POST"])
def start_stream():
    """Starts or restarts the video stream with a new URL."""
    global app_state
    
    stream_url = request.json.get("stream_url", 0)

    if app_state["capture_thread"] and app_state["capture_thread"].is_alive():
        app_state["shutdown_flag"].set()
        app_state["capture_thread"].join(timeout=2)
        if app_state["video_capture"]:
            app_state["video_capture"].release()

    app_state["shutdown_flag"].clear()
    app_state["video_capture"] = cv2.VideoCapture(stream_url)

    if not app_state["video_capture"].isOpened():
        logging.error(f"Failed to open video source: {stream_url}")
        return {"status": "error", "message": "Could not open video source."}, 400

    app_state["capture_thread"] = threading.Thread(target=video_stream_loop, daemon=True)
    app_state["capture_thread"].start()
    
    logging.info(f"Started video stream from: {stream_url}")
    return {"status": "success", "message": f"Stream started from {stream_url}"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)