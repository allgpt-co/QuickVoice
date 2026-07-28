import wave
import struct
import os

os.makedirs("testdata", exist_ok=True)

out = "testdata/probe.wav"
sample_rate = 24000
duration = 1.0  # seconds
num_samples = int(sample_rate * duration)

with wave.open(out, "w") as w:
    w.setnchannels(1)      # mono
    w.setsampwidth(2)      # 16-bit PCM
    w.setframerate(sample_rate)

    for _ in range(num_samples):
        w.writeframes(struct.pack("<h", 0))  # silence

print(f"Created {out}")