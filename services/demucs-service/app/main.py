from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
import os
import shutil
import uuid
from app.core.inference import separate_stems

app = FastAPI()
TEMP_DIR = "/tmp/pocketgroove"
os.makedirs(TEMP_DIR, exist_ok=True)
TASKS = {}


def _run_separation(task_id: str, input_path: str, output_dir: str, model: str):
    task = TASKS[task_id]

    def update_progress(percent: int):
        task["progress"] = max(task["progress"], min(99, percent))

    try:
        stems_path = separate_stems(input_path, output_dir, model, update_progress)
        stems = []
        for filename in sorted(os.listdir(stems_path)):
            source_path = os.path.join(stems_path, filename)
            if os.path.isfile(source_path) and filename.lower().endswith(".wav"):
                shutil.move(source_path, os.path.join(output_dir, filename))
                stems.append({"filename": filename, "name": os.path.splitext(filename)[0]})
        if not stems:
            raise RuntimeError("Demucs n'a généré aucune piste audio.")
        task.update({"status": "COMPLETED", "progress": 100, "stems": stems})
    except Exception as error:
        task.update({"status": "FAILED", "error": str(error)})
    finally:
        if os.path.exists(input_path):
            os.remove(input_path)


@app.post("/separate")
async def separate(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    model: str = Form(default="htdemucs_6s"),
):
    task_id = str(uuid.uuid4())
    input_path = os.path.join(TEMP_DIR, f"{task_id}_{file.filename}")
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    TASKS[task_id] = {"status": "PROCESSING", "progress": 0, "stems": []}
    output_dir = os.path.join(TEMP_DIR, task_id)
    background_tasks.add_task(_run_separation, task_id, input_path, output_dir, model)
    return {"message": "Separation started", "task_id": task_id, "status": "PROCESSING", "progress": 0}


@app.get("/tasks/{task_id}")
async def get_task(task_id: str):
    try:
        if str(uuid.UUID(task_id)) != task_id:
            raise ValueError("Invalid task identifier")
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Task not found") from error

    task = TASKS.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task_id": task_id, **task}


@app.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    try:
        if str(uuid.UUID(task_id)) != task_id:
            raise ValueError("Invalid task identifier")
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Task not found") from error

    task = TASKS.get(task_id)
    if task and task["status"] == "PROCESSING":
        raise HTTPException(status_code=409, detail="Cannot delete a task while separation is running")
    TASKS.pop(task_id, None)

    task_dir = os.path.realpath(os.path.join(TEMP_DIR, task_id))
    temp_root = os.path.realpath(TEMP_DIR)
    if os.path.commonpath([temp_root, task_dir]) != temp_root:
        raise HTTPException(status_code=404, detail="Task not found")
    shutil.rmtree(task_dir, ignore_errors=True)
    return {"task_id": task_id, "deleted": True}


@app.get("/stems/{task_id}/{filename}")
async def get_stem(task_id: str, filename: str):
    try:
        if str(uuid.UUID(task_id)) != task_id:
            raise ValueError("Invalid task identifier")
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Stem not found") from error
    if os.path.basename(filename) != filename:
        raise HTTPException(status_code=404, detail="Stem not found")
    stem_path = os.path.realpath(os.path.join(TEMP_DIR, task_id, filename))
    task_dir = os.path.realpath(os.path.join(TEMP_DIR, task_id))
    if os.path.commonpath([task_dir, stem_path]) != task_dir or not os.path.isfile(stem_path):
        raise HTTPException(status_code=404, detail="Stem not found")
    return FileResponse(stem_path, media_type="audio/wav", filename=filename)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
