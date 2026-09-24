from fastapi import FastAPI, File, HTTPException, UploadFile
import os
import shutil
import uuid
from app.core.inference import transcribe_audio

app = FastAPI()
TEMP_DIR = "/tmp/pocketgroove"
if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    task_id = str(uuid.uuid4())
    input_path = os.path.join(TEMP_DIR, f"{task_id}_{file.filename}")
    
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    output_dir = os.path.join(TEMP_DIR, task_id)
    try:
        midi_path = transcribe_audio(input_path, output_dir)
        return {"message": "Transcription completed", "task_id": task_id, "midi_path": midi_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        os.remove(input_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
