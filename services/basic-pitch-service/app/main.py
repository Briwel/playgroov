from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
import os
import shutil
import tempfile
import uuid
from app.core.inference import transcribe_audio

app = FastAPI()
TEMP_DIR = os.path.join(tempfile.gettempdir(), "pocketgroove", "basic-pitch")
os.makedirs(TEMP_DIR, exist_ok=True)


def _task_directory(task_id: str) -> str:
    try:
        if str(uuid.UUID(task_id)) != task_id:
            raise ValueError("Invalid task identifier")
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Transcription not found") from error
    return os.path.realpath(os.path.join(TEMP_DIR, task_id))

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    task_id = str(uuid.uuid4())
    safe_filename = os.path.basename(file.filename or "audio") or "audio"
    input_path = os.path.join(TEMP_DIR, f"{task_id}_{safe_filename}")
    
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    output_dir = _task_directory(task_id)
    try:
        midi_path = transcribe_audio(input_path, output_dir)
        return {"message": "Transcription completed", "task_id": task_id, "filename": os.path.basename(midi_path)}
    except Exception as e:
        shutil.rmtree(output_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        if os.path.exists(input_path):
            os.remove(input_path)


@app.get("/midi/{task_id}")
async def get_midi(task_id: str):
    task_dir = _task_directory(task_id)
    if os.path.commonpath([os.path.realpath(TEMP_DIR), task_dir]) != os.path.realpath(TEMP_DIR):
        raise HTTPException(status_code=404, detail="MIDI file not found")
    if not os.path.isdir(task_dir):
        raise HTTPException(status_code=404, detail="MIDI file not found")

    midi_files = [name for name in os.listdir(task_dir) if name.lower().endswith(".mid")]
    if len(midi_files) != 1:
        raise HTTPException(status_code=404, detail="MIDI file not found")

    filename = midi_files[0]
    return FileResponse(
        os.path.join(task_dir, filename),
        media_type="audio/midi",
        filename=filename,
    )


@app.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    task_dir = _task_directory(task_id)
    if os.path.commonpath([os.path.realpath(TEMP_DIR), task_dir]) != os.path.realpath(TEMP_DIR):
        raise HTTPException(status_code=404, detail="Transcription not found")
    shutil.rmtree(task_dir, ignore_errors=True)
    return {"task_id": task_id, "deleted": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
