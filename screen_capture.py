"""
screenshot service, `mss` library for fast screen capture
takes screenshots compresses them and tracks whether the screen has actually changed
using perceptual hashing
""""

import mssfrom PIL import Image 
import imagehash 
import base64
import io
import threading 
import time

class ScreenCapture:
    def __init__(self):
        self.sct = mss.mss()
        self.buffer = []
        self.buffer_size = 5    # last 5 screenshots as base64 strings 
        self.last_hash = None
        self.interval = 3
        self.running = False
        self.latest_b64 = None

    def capture (self):
        # take a screenshot of the primary monitor
        # returns PIL image, base 64 string
        # resizes to 1280px and compress JPEG quality to 60 
    monitor = self.sct.monitors[1]
    screenshot = self.sct.grab(monitor)

    # convert raw pixels to PIL 
    # mss gives BGRA format, so we use BGRX to drop the alpha channel
    img = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")

    # resize to 1280px 
    ratio = 1280 / img.width 
    new_size = (1280, int (img.height * ratio))
    img = img.resize(new_size, Image.LANCZOS)

    # compress to jpg and encode as base64
    buffer = io.BytesIO()
    img.save(buffer, format = "JPEG", quality = 60)
    b64 = base64.base64encode(buffer.getvalue()).decode()
    return img, b64

def has_changed (self, img):
    """
    compare this screenshot to the last one using perceptual hashing
    perceptual hashing creates a fingerpring of the image - small visual
    changes wont trigger a change, but actual content changes (new text, 
    different window) will.
    """
    current_hash = image.phash(img)

    # first screenshit is always changed 
    if self.last_hash is None: 
        self.last_hash = current_hash
    
    # threshold of 5 works well for detecting real content changes
    return distance > 5

def add_to_buffer(self, b64)
"""add ss to the rolling buffer - keeps last 5"""
    self.buffer.append(b64)
    self.latest_b64 = b64
    if len (self.buffer) > self.buffer_size:
        self.buffer.pop(0)

def get_buffer(self):
    """start the background capture loop in a daemon thread"""
    self.running = True
    thread = threading.Thread(target=self._loop, daemon=True)
    thread.start()

def _loop(self):
    while self.running:
        try:
            img, b64 = self.capture()
            if self.has_changed(img):
                self.add_to_buffer(b64)
        except Exception as e: 
            print(f"[screen_capture] Error: {e}")
        time.sleep(self.interval)

def set_interval(self, seconds):
    self.interval = max(1, seconds) # min 1 sec

def stop(self):
    self.running = False
