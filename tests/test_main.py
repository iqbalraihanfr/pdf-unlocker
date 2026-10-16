import errno
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import MagicMock, patch

import pikepdf

import main
from main import Api


class UnlockTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.folder = Path(self.directory.name)
        self.source = self.folder / 'statement.pdf'
        with pikepdf.new() as pdf:
            pdf.add_blank_page()
            pdf.save(self.source, encryption=pikepdf.Encryption(owner='owner', user='secret'))
        self.original = self.source.read_bytes()
        self.api = Api()

    def unlock(self, password='secret', **fields):
        return self.api.unlock_files([{'path': str(self.source), **fields}], password)[0]

    def assert_no_output(self):
        self.assertEqual(list(self.folder.iterdir()), [self.source])
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_unlock_returns_readable_unencrypted_output_and_preserves_source(self):
        result = self.unlock()
        self.assertTrue(result['success'], result['error'])
        output = Path(result['outputPath'])
        self.assertEqual(output.name, 'statement_unlocked.pdf')
        with pikepdf.open(output) as pdf:
            self.assertFalse(pdf.is_encrypted)
            self.assertEqual(len(pdf.pages), 1)
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assertFalse(list(self.folder.glob('.pdf-unlocker-*')))
        if os.name == 'posix':
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)

    def test_wrong_password_leaves_no_output(self):
        result = self.unlock('wrong')
        self.assertFalse(result['success'])
        self.assertEqual(result['error'], 'Password salah')
        self.assertEqual(result['outputPath'], '')
        self.assert_no_output()

    def test_custom_password_overrides_global(self):
        self.assertTrue(self.unlock('wrong', customPassword='secret')['success'])

    def test_unencrypted_pdf_accepts_empty_password(self):
        plain = self.folder / 'plain.PDF'
        with pikepdf.new() as pdf:
            pdf.add_blank_page()
            pdf.save(plain)
        result = self.api.unlock_files([{'path': str(plain)}], '')[0]
        self.assertTrue(result['success'], result['error'])

    def test_existing_outputs_and_symlinks_are_never_overwritten(self):
        existing = self.folder / 'statement_unlocked.pdf'
        existing.write_bytes(b'previous output')
        alias = self.folder / 'statement_unlocked_1.pdf'
        alias.symlink_to(self.source)
        result = self.unlock()
        self.assertTrue(result['success'], result['error'])
        self.assertEqual(Path(result['outputPath']).name, 'statement_unlocked_2.pdf')
        self.assertEqual(existing.read_bytes(), b'previous output')
        self.assertTrue(alias.is_symlink())
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_concurrent_unlocks_publish_distinct_complete_files(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.unlock(), range(4)))
        paths = [result['outputPath'] for result in results]
        self.assertTrue(all(result['success'] for result in results), results)
        self.assertEqual(len(set(paths)), 4)
        for path in paths:
            with pikepdf.open(path) as pdf:
                self.assertFalse(pdf.is_encrypted)
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_partial_save_is_cleaned_up_and_pdf_closed(self):
        context = MagicMock()

        def fail_save(output):
            output.write(b'partial PDF')
            raise OSError(errno.ENOSPC, 'disk full')

        context.__enter__.return_value.save.side_effect = fail_save
        with patch('main.pikepdf.open', return_value=context):
            result = self.unlock()
        self.assertFalse(result['success'])
        self.assertIn('ruang disk', result['error'])
        context.__exit__.assert_called_once()
        self.assert_no_output()

    def test_permission_denied_has_actionable_error(self):
        with patch('main.tempfile.TemporaryDirectory', side_effect=PermissionError):
            result = self.unlock()
        self.assertFalse(result['success'])
        self.assertIn('izin', result['error'])
        self.assert_no_output()

    def test_failed_publication_cleans_staging_files(self):
        with patch('main.os.link', side_effect=OSError(errno.ENOTSUP, 'unsupported')):
            result = self.unlock()
        self.assertFalse(result['success'])
        self.assertIn('folder lokal', result['error'])
        self.assert_no_output()

    def test_invalid_items_do_not_abort_remaining_files(self):
        invalid = [None, [], {'path': 1}, {'path': ''}, {'path': 'relative.pdf'},
                   {'path': '/bad\x00.pdf'}, {'path': str(self.source), 'customPassword': None},
                   {'path': str(self.source.with_suffix('.txt'))}]
        results = self.api.unlock_files(invalid + [{'path': str(self.source)}], 'secret')
        self.assertTrue(all(not result['success'] and result['error'] for result in results[:-1]))
        self.assertTrue(results[-1]['success'])

    def test_invalid_batch_arguments_are_rejected(self):
        for payload, password in [(None, ''), ({}, ''), ([], None), ([], 123)]:
            with self.subTest(payload=payload, password=password), self.assertRaises(ValueError):
                self.api.unlock_files(payload, password)
        self.assert_no_output()

    def test_corrupt_and_missing_pdf_have_distinct_errors(self):
        corrupt = self.folder / 'corrupt.pdf'
        corrupt.write_bytes(b'not a PDF')
        results = self.api.unlock_files([
            {'path': str(corrupt)}, {'path': str(self.folder / 'missing.pdf')}
        ], '')
        self.assertIn('PDF rusak', results[0]['error'])
        self.assertIn('tidak ditemukan', results[1]['error'])
        self.assertFalse(list(self.folder.glob('*_unlocked*')))
        self.assertFalse(list(self.folder.glob('.pdf-unlocker-*')))

    def test_dialog_cancel_error_and_selection(self):
        window = MagicMock()
        self.api.set_window(window)
        window.create_file_dialog.return_value = None
        self.assertEqual(self.api.select_files(), [])
        window.create_file_dialog.return_value = [str(self.source)]
        selected = self.api.select_files()
        self.assertEqual(selected[0]['path'], str(self.source))
        self.assertEqual(selected[0]['status'], 'pending')
        window.create_file_dialog.side_effect = OSError('dialog failed')
        with self.assertRaisesRegex(RuntimeError, 'dialog'):
            self.api.select_files()

    def test_desktop_starts_with_debug_disabled_and_file_uri(self):
        with patch('main.webview.create_window') as create, patch('main.webview.start') as start:
            main.main()
        start.assert_called_once_with(debug=False)
        url = create.call_args.kwargs['url']
        self.assertEqual(url, (Path(main.__file__).parent / 'frontend/dist/index.html').as_uri())


if __name__ == '__main__':
    unittest.main()
