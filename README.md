# PDF Unlocker & Editor

Aplikasi desktop lokal untuk **membuka password PDF**, **menambahkan komentar / sticky notes**, **stabilo (highlight)**, **teks bebas**, dan **coretan/tanda tangan** secara **100% offline**. Pemrosesan dilakukan langsung di komputer pengguna menggunakan **pywebview + pikepdf + pdf-lib**, dengan antarmuka modern **React + Vite** bertema Codecademy Gamut. Tidak ada data atau file yang diunggah ke internet atau server cloud mana pun.

## Menjalankan aplikasi

Siapkan Python, Node.js, dan npm. Gunakan virtual environment:

```sh
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
cd frontend
npm ci
npm run build
cd ..
python main.py
```

Pada Windows, aktifkan environment dengan `venv\Scripts\activate`. pywebview memerlukan runtime webview native sesuai sistem operasi. Versi dependensi Python langsung dikunci di `requirements.txt`; dependensi frontend mengikuti `package-lock.json` melalui `npm ci`.

## Penggunaan

1. Pilih satu atau beberapa PDF melalui **Pilih File PDF**.
2. Isi password global untuk file yang memakai password sama. Password per file, jika diisi, mendapat prioritas.
3. Klik **Buka Password PDF**. Progres dan hasil diperbarui setelah setiap file selesai.
4. Lokasi hasil tampil di bawah nama file dan dapat disalin. Hasil berada di folder PDF asal: `nama_unlocked.pdf`, kemudian `nama_unlocked_1.pdf`, dan seterusnya jika nama sudah dipakai.
5. Perbaiki password atau masalah folder, lalu pilih **Coba Lagi / Proses Sisa**. File yang sudah berhasil dilewati. Untuk memproses ulang file berhasil, hapus dari daftar lalu pilih kembali.

Pemilihan dan penghapusan file dikunci selama batch berjalan. Jika koneksi API gagal, file yang belum selesai ditandai gagal agar dapat dicoba lagi. Dialog yang dibatalkan tidak dianggap error.

## Fitur Edit & Anotasi PDF (All-in-One Offline)

Tab **Edit & Catat PDF** memungkinkan pengeditan dokumen langsung tanpa mengunggah ke server cloud (alternatif Adobe Acrobat Web yang 100% lokal & privat):
- **Buka File**: Pilih PDF lokal mana saja melalui tombol *Pilih PDF untuk Diedit*, atau klik *Edit / Beri Catatan* langsung pada file yang baru saja dibuka passwordnya di antrean unlocker.
- **Pilih & Seleksi Teks**: Sorot teks untuk memunculkan floating pill mini (*Beri Stabilo* atau *Tambah Catatan*) ala Adobe/Notion.
- **Stabilo (Highlight)**: Beri stabilo warna pada teks atau area tertentu (pilihan warna Kuning Emas, Hijau Lime, Biru Langit, Pink).
- **Sticky Note (Catatan)**: Letakkan pin catatan di mana saja pada halaman untuk menulis komentar. Dilengkapi penomoran otomatis dan terhubung ke panel daftar komentar.
- **Teks Bebas**: Ketik teks tambahan pada halaman PDF dengan pilihan ukuran font (12px, 16px, 20px, 24px) dan warna.
- **Pena & Tanda Tangan**: Gambar coretan bebas, tanda tangan digital, atau garis penunjuk dengan pilihan ketebalan dan warna.
- **Panel Komentar & Anotasi**: Sidebar kanan yang dapat disembunyikan untuk melihat seluruh catatan dokumen. Klik pada salah satu catatan untuk langsung menuju ke halaman dan pin terkait (*smooth scroll*).
- **Simpan PDF Baru**: Menyimpan file hasil modifikasi sebagai `nama_edited.pdf` di folder lokal asal secara aman tanpa menimpa file asli, dengan tombol praktis *Buka di Folder* (Finder / Explorer).

## Penyimpanan dan privasi

- File asli dan hasil lama tidak ditimpa. PDF ditulis ke file sementara di folder asal, ditutup, lalu dipublikasikan tanpa menimpa nama yang sudah ada, termasuk saat dua proses berjalan bersamaan.
- Folder harus dapat ditulis, memiliki ruang disk cukup, dan mendukung **hard link** (misalnya APFS atau NTFS). FAT/exFAT dan sebagian folder jaringan tidak mendukung mekanisme publikasi ini; pindahkan PDF ke folder lokal yang mendukungnya jika penyimpanan gagal.
- Hasil **tidak memiliki password**. Simpan di folder yang aksesnya sesuai kebutuhan Anda. Pada sistem POSIX, izin hasil dibatasi ke pemilik (`0600`); pada Windows, izin mengikuti ACL folder.
- Password tidak disimpan ke disk atau log oleh aplikasi. Password per file dibersihkan dari state UI setelah berhasil; password global tetap di memori selama sesi. Ini bukan jaminan penghapusan aman dari memori.
- File sementara dibersihkan setelah operasi berhasil atau gagal. Penghentian paksa aplikasi atau mati listrik dapat meninggalkan folder `.pdf-unlocker-*` berisi data sensitif; hapus folder sisa tersebut saat aplikasi sudah ditutup.
- Mode debug pywebview dinonaktifkan secara default.

## Pengembangan dan pemeriksaan

```sh
venv/bin/python -m unittest discover -s tests -v
cd frontend
npm run lint
npm run build
```

Tes backend membuat PDF sementara dan memeriksa unlock, password salah, prioritas password, payload invalid, PDF rusak, konflik nama/symlink, penulisan bersamaan, serta kegagalan simpan dan publikasi.

`npm run dev` atau `npm run preview` dapat dipakai untuk meninjau UI di browser. Pemilihan file dan unlock memerlukan bridge pywebview dari aplikasi desktop. Setelah mengubah frontend, jalankan kembali `npm run build` sebelum membuka `python main.py`.

Tes UI opsional tersedia di `tests/frontend_smoke.js` dan memakai API tiruan, bukan dokumen pribadi. Jika Playwright CLI tersedia, jalankan preview pada port 4173 di terminal terpisah, lalu jalankan dari folder proyek:

```sh
# Terminal pertama, dari frontend/
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort

# Terminal kedua, dari folder proyek
playwright-cli -s=pdf-unlocker-check open http://127.0.0.1:4173
playwright-cli -s=pdf-unlocker-check run-code --filename=tests/frontend_smoke.js
playwright-cli -s=pdf-unlocker-check close
```

Tes ini memeriksa pemilihan dengan keyboard, progres, penguncian kontrol, kegagalan API, retry, lokasi hasil, duplikasi pilihan, pembatalan/error dialog, dan layout pada dua ukuran jendela. Tidak ada dependensi runtime aplikasi tambahan untuk tes tersebut.
