import os
import re
import shutil
import subprocess
import tempfile


def separate_stems(input_path: str, output_dir: str, model="htdemucs_6s", progress_callback=None):
    """Run Demucs and report its actual tqdm percentage through the callback."""
    os.makedirs(output_dir, exist_ok=True)

    with tempfile.TemporaryDirectory() as temp_dir:
        cmd = ["demucs", "-n", model, "-o", temp_dir, input_path]
        # Demucs prints track names and paths to stdout. On Windows, Python can
        # inherit the legacy cp1252 console encoding and crash when a name has
        # characters outside that encoding. Force UTF-8 in the child process.
        child_env = os.environ.copy()
        child_env["PYTHONUTF8"] = "1"
        child_env["PYTHONIOENCODING"] = "utf-8"
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=0,
            env=child_env,
        )
        progress_line = bytearray()
        output_tail = bytearray()
        assert process.stdout is not None

        # tqdm updates the same terminal line with carriage returns, so read
        # the pipe byte by byte and parse each update as soon as it arrives.
        while True:
            char = process.stdout.read(1)
            if not char:
                break
            if char in (b"\r", b"\n"):
                match = re.search(rb"\b(\d{1,3})%", progress_line)
                if match and progress_callback:
                    progress_callback(min(99, int(match.group(1))))
                output_tail.extend(progress_line)
                output_tail.extend(b"\n")
                if len(output_tail) > 8192:
                    del output_tail[:-4096]
                progress_line.clear()
            else:
                progress_line.extend(char)

        return_code = process.wait()
        if progress_line:
            output_tail.extend(progress_line)
        if return_code != 0:
            details = output_tail.decode("utf-8", errors="replace").strip()
            raise RuntimeError(f"Demucs error: {details[-3000:]}")

        filename = os.path.splitext(os.path.basename(input_path))[0]
        demucs_output_path = os.path.join(temp_dir, model, filename)
        if not os.path.exists(demucs_output_path):
            raise RuntimeError("Demucs did not generate expected output files.")

        final_output_path = os.path.join(output_dir, filename)
        if os.path.exists(final_output_path):
            shutil.rmtree(final_output_path)
        shutil.move(demucs_output_path, final_output_path)

    return final_output_path
