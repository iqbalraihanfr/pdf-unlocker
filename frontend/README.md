# Antarmuka PDF Unlocker

React + Vite, dengan ikon lucide-react dan pemeriksaan Oxlint. Panduan instalasi, penggunaan, penyimpanan hasil, dan tes backend ada di [README aplikasi](../README.md).

```sh
npm ci
npm run dev      # Pratinjau UI; API Python hanya tersedia di desktop
npm run lint
npm run build    # Hasil di dist/, dibaca main.py
```

Tidak ada password atau dokumen yang disimpan di localStorage. File berhasil dilewati saat retry; pemrosesan dilakukan berurutan agar progres setiap file langsung terlihat.
