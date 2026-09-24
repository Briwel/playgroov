from basic_pitch.inference import predict_and_save
import os
import tempfile
import shutil

def transcribe_audio(input_path: str, output_dir: str):
    """
    Appelle Basic Pitch pour convertir l'audio en MIDI.
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
        
    filename = os.path.splitext(os.path.basename(input_path))[0]
    expected_midi_name = f"{filename}_basic_pitch.mid"
    
    # Utiliser un répertoire temporaire pour Basic Pitch
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            # Basic Pitch génère des fichiers .mid, .csv, .npz
            predict_and_save(
                audio_path_list=[input_path],
                output_directory=temp_dir,
                save_midi=True,
                save_model_outputs=False,
                save_notes=False
            )
            
            temp_midi_path = os.path.join(temp_dir, expected_midi_name)
            
            if not os.path.exists(temp_midi_path):
                raise Exception("Basic Pitch did not generate the MIDI file.")
                
            # Déplacer le fichier MIDI généré vers le répertoire final
            final_midi_path = os.path.join(output_dir, expected_midi_name)
            shutil.move(temp_midi_path, final_midi_path)
            
            return final_midi_path
        except Exception as e:
            raise Exception(f"Basic Pitch error: {str(e)}")
