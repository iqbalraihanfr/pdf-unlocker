import os
import sys
import tempfile
import webview
import pikepdf
from pathlib import Path

class Api:
    def __init__(self):
        self._window = None

    def set_window(self, window):
        self._window = window

    def select_files(self):
        """Membuka dialog untuk memilih file PDF"""
        try:
            file_types = ('PDF Files (*.pdf)',)
            result = self._window.create_file_dialog(
                webview.FileDialog.OPEN,
                allow_multiple=True, 
                file_types=file_types
            )
            
            if not result:
                return []
                
            files_data = []
            for file_path in result:
                path_obj = Path(file_path)
                files_data.append({
                    'path': str(path_obj.absolute()),
                    'name': path_obj.name,
                    'status': 'pending',
                    'customPassword': '',
                    'errorMsg': ''
                })
            return files_data
        except Exception as e:
            raise RuntimeError('Tidak dapat membuka dialog pemilihan file.') from e

    def unlock_files(self, files_payload, global_password):
        """
        Menerima daftar file untuk di-unlock:
        files_payload: list of dict {'path': '...', 'customPassword': '...'}
        global_password: string
        """
        if not isinstance(files_payload, list):
            raise ValueError('Daftar file harus berupa list.')
        if not isinstance(global_password, str):
            raise ValueError('Password global harus berupa teks.')

        results = []
        for file_info in files_payload:
            file_path = file_info.get('path') if isinstance(file_info, dict) else None
            result = {
                'path': file_path if isinstance(file_path, str) else None,
                'success': False,
                'error': '',
                'outputPath': '',
            }
            
            try:
                if not isinstance(file_info, dict):
                    raise ValueError('Data file harus berupa objek.')
                if not isinstance(file_path, str) or not file_path or '\x00' in file_path:
                    raise ValueError('Path file tidak valid.')
                custom_password = file_info.get('customPassword', '')
                if not isinstance(custom_password, str):
                    raise ValueError('Password file harus berupa teks.')
                path_obj = Path(file_path)
                if not path_obj.is_absolute() or path_obj.suffix.lower() != '.pdf':
                    raise ValueError('Pilih file PDF dengan path absolut.')
                if not path_obj.is_file():
                    raise FileNotFoundError(file_path)

                with tempfile.TemporaryDirectory(prefix='.pdf-unlocker-', dir=path_obj.parent) as staging:
                    temporary_path = Path(staging) / 'output.pdf'
                    with pikepdf.open(file_path, password=custom_password or global_password) as pdf:
                        with temporary_path.open('xb') as output:
                            os.chmod(temporary_path, 0o600)
                            pdf.save(output)
                            output.flush()
                            os.fsync(output.fileno())

                    index = 0
                    while True:
                        suffix = f'_{index}' if index else ''
                        output_path = path_obj.with_name(f'{path_obj.stem}_unlocked{suffix}.pdf')
                        try:
                            # shortcut: publication requires hard links; add a no-replace fallback for FAT/network folders.
                            os.link(temporary_path, output_path)
                            break
                        except FileExistsError:
                            index += 1

                result['success'] = True
                result['outputPath'] = str(output_path)
            except pikepdf.PasswordError:
                result['error'] = 'Password salah'
            except pikepdf.PdfError:
                result['error'] = 'PDF rusak atau formatnya tidak didukung.'
            except FileNotFoundError:
                result['error'] = 'File atau folder tidak ditemukan.'
            except PermissionError:
                result['error'] = 'Tidak memiliki izin membaca file atau menulis ke folder hasil.'
            except ValueError as e:
                result['error'] = str(e)
            except OSError:
                result['error'] = 'Gagal membaca atau menyimpan PDF. Periksa ruang disk atau coba folder lokal lain.'
            except Exception:
                result['error'] = 'Terjadi kesalahan saat memproses PDF. Silakan coba lagi.'
                
            results.append(result)
            
        return results

def main():
    api = Api()
    
    entry_point = Path(__file__).resolve().parent / 'frontend' / 'dist' / 'index.html'

    if not entry_point.is_file():
        print(f"File tidak ditemukan: {entry_point}")
        print("Pastikan Anda sudah menjalankan 'npm run build' di folder frontend.")
        sys.exit(1)
        
    window = webview.create_window(
        'PDF Unlocker (Lokal)', 
        url=entry_point.as_uri(),
        js_api=api,
        width=900,
        height=700,
        resizable=True
    )
    api.set_window(window)
    
    # Jalankan aplikasi PyWebView
    webview.start(debug=False)

if __name__ == '__main__':
    main()
