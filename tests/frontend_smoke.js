async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('http://127.0.0.1:4173');
  const select = page.getByRole('button', { name: /^Pilih File PDF/ });
  await select.waitFor();
  assert(await select.isDisabled(), 'Selection must wait for desktop bridge');

  await page.evaluate(() => {
    window.testCalls = [];
    window.testMode = 'manual';
    window.testSelection = 'files';
    const files = ['a.pdf', 'b.pdf', 'c.pdf'].map(name => ({
      path: `/test/${name}`, name, status: 'pending', customPassword: '', errorMsg: ''
    }));
    window.pywebview = { api: {
      select_files: async () => {
        if (window.testSelection === 'error') throw new Error('dialog failure');
        return window.testSelection === 'cancel' ? [] : files;
      },
      unlock_files: (payload, password) => {
        window.testCalls.push({ payload, password });
        if (window.testMode === 'auto') return Promise.resolve([{
          path: payload[0].path, success: true, error: '', outputPath: payload[0].path.replace('.pdf', '_unlocked.pdf')
        }]);
        return new Promise((resolve, reject) => { window.resolveUnlock = resolve; window.rejectUnlock = reject; });
      }
    } };
    window.dispatchEvent(new Event('pywebviewready'));
  });
  await page.waitForFunction(() => !document.querySelector('.drop-zone').disabled);
  await select.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Daftar File (3)' }).waitFor();
  await page.getByLabel('Password global (opsional)').fill('secret');
  await page.getByRole('button', { name: 'Buka Password PDF' }).click();
  await page.waitForFunction(() => window.testCalls.length === 1);
  assert(await page.getByRole('button', { name: '+ Tambah File' }).isDisabled(), 'Cannot add files during batch');
  assert(await page.getByLabel('Hapus a.pdf dari daftar').isDisabled(), 'Cannot remove during batch');
  assert(await page.getByLabel('Password untuk a.pdf').isDisabled(), 'Cannot edit during batch');
  await page.evaluate(() => window.resolveUnlock([{
    path: '/test/a.pdf', success: true, error: '', outputPath: '/test/a_unlocked.pdf'
  }]));
  await page.waitForFunction(() => window.testCalls.length === 2);
  assert(await page.getByRole('progressbar').getAttribute('value') === '1', 'Progress updates before batch ends');
  await page.getByText('Hasil: /test/a_unlocked.pdf', { exact: true }).waitFor();
  await page.evaluate(() => window.resolveUnlock([{ path: '/test/b.pdf', success: false, error: 'Password salah' }]));
  await page.waitForFunction(() => window.testCalls.length === 3);
  await page.evaluate(() => window.rejectUnlock(new Error('bridge lost')));
  await page.getByRole('alert').waitFor();
  await page.waitForFunction(() => document.querySelector('progress').value === 3);
  assert(await page.locator('.status-processing').count() === 0, 'API failure cannot leave processing status');
  assert(await page.locator('.file-item-error').count() === 2, 'Failed and interrupted files remain retryable');

  await page.getByLabel('Password untuk b.pdf').fill('right');
  await page.evaluate(() => { window.testMode = 'auto'; });
  await page.getByRole('button', { name: 'Coba Lagi / Proses Sisa' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.file-item-success').length === 3);
  const calls = await page.evaluate(() => window.testCalls);
  assert(calls.map(call => call.payload[0].path).join(',') === '/test/a.pdf,/test/b.pdf,/test/c.pdf,/test/b.pdf,/test/c.pdf', 'Retry skips successful files');
  assert(calls[3].payload[0].customPassword === 'right' && calls[3].password === 'secret', 'Per-file and global passwords passed correctly');
  assert(await page.getByLabel('Password untuk b.pdf').inputValue() === '', 'Successful custom password cleared');
  assert(await page.getByRole('button', { name: 'Buka Password PDF' }).isDisabled(), 'No successful file reprocessed');
  await page.getByRole('button', { name: '+ Tambah File' }).click();
  await page.getByRole('heading', { name: 'Daftar File (3)' }).waitFor();
  assert(await page.locator('.file-item').count() === 3, 'Duplicate selection ignored');

  await page.evaluate(() => { window.testSelection = 'error'; });
  await page.getByRole('button', { name: '+ Tambah File' }).click();
  await page.getByRole('alert').filter({ hasText: 'Tidak dapat memilih file' }).waitFor();
  await page.evaluate(() => { window.testSelection = 'cancel'; });
  await page.getByRole('button', { name: '+ Tambah File' }).click();
  await page.waitForFunction(() => !document.querySelector('.add-btn').disabled);
  assert(await page.getByRole('alert').count() === 0, 'Cancel is not an error');

  for (const size of [{ width: 900, height: 700 }, { width: 480, height: 600 }]) {
    await page.setViewportSize(size);
    const layout = await page.evaluate(() => {
      const action = document.querySelector('.unlock-btn').getBoundingClientRect();
      const list = document.querySelector('.file-list-container').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth, actionBottom: action.bottom, listHeight: list.height };
    });
    assert(!layout.overflow, 'No horizontal overflow');
    assert(layout.actionBottom <= size.height && layout.listHeight > 0, 'Actions and file list stay visible');
  }
  await page.getByLabel('Hapus a.pdf dari daftar').click();
  await page.getByRole('heading', { name: 'Daftar File (2)' }).waitFor();
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  console.log('PASS: keyboard selection, progress, batch locking, API failure recovery, retry, output paths, duplicate selection, dialog failure/cancel, responsive layout');
}
