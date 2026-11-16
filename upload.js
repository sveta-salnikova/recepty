// Загрузка файла в папку vhodyashchie репозитория через GitHub API.
// Ключ вводится один раз и хранится в этом браузере (localStorage).
const OWNER = 'sveta-salnikova';
const REPO = 'recepty';
const INBOX = 'vhodyashchie';
const API = 'https://api.github.com';

let file = null;
const $ = id => document.getElementById(id);
const status = (t, cls) => { $('status').textContent = t; $('status').className = 'status ' + (cls || ''); };

$('token').value = localStorage.getItem('gh-token') || '';
$('token').addEventListener('change', e => localStorage.setItem('gh-token', e.target.value.trim()));

const drop = $('drop');
drop.onclick = () => $('file').click();
drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]); };
$('file').onchange = e => pick(e.target.files[0]);

function pick(f) {
  if (!f) return;
  file = f;
  drop.textContent = f.name + ' · ' + (f.size / 1048576).toFixed(1) + ' МБ';
  $('go').disabled = false;
  status('');
}

const b64 = f => new Promise((ok, err) => {
  const r = new FileReader();
  r.onload = () => ok(r.result.split(',')[1]);
  r.onerror = err;
  r.readAsDataURL(f);
});

async function gh(path, opts) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Authorization': 'Bearer ' + localStorage.getItem('gh-token'),
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(opts && opts.headers)
    }
  });
  if (!res.ok) {
    const t = await res.json().catch(() => ({}));
    throw new Error(t.message || ('HTTP ' + res.status));
  }
  return res.status === 204 ? {} : res.json();
}

// маленькие файлы — Contents API, большие — через blob + tree + commit
async function upload() {
  if (!localStorage.getItem('gh-token')) { status('Сначала вставь ключ GitHub в поле выше', 'err'); return; }
  if (!file) { status('Выбери файл', 'err'); return; }
  $('go').disabled = true;
  try {
    const name = Date.now() + '-' + file.name.replace(/[^\w.\-а-яёА-ЯЁ]/gi, '_');
    status('Читаю файл…');
    const content = await b64(file);

    if (file.size < 20 * 1048576) {
      status('Отправляю в репозиторий…');
      await gh(`/repos/${OWNER}/${REPO}/contents/${INBOX}/${name}`, {
        method: 'PUT',
        body: JSON.stringify({ message: 'Загрузка ' + file.name, content })
      });
    } else {
      status('Файл большой, отправляю частями…');
      const blob = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, {
        method: 'POST', body: JSON.stringify({ content, encoding: 'base64' })
      });
      const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
      const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits/` + ref.object.sha);
      const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({
          base_tree: commit.tree.sha,
          tree: [{ path: INBOX + '/' + name, mode: '100644', type: 'blob', sha: blob.sha }]
        })
      });
      const nc = await gh(`/repos/${OWNER}/${REPO}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({ message: 'Загрузка ' + file.name, tree: tree.sha, parents: [ref.object.sha] })
      });
      await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/main`, {
        method: 'PATCH', body: JSON.stringify({ sha: nc.sha })
      });
    }
    status('Готово! Напиши в чат «забери файл» — я разберу его и выложу на сайт.', 'ok');
    $('go').disabled = false;
    file = null;
  } catch (e) {
    status('Не получилось: ' + e.message + '. Проверь ключ и попробуй ещё раз.', 'err');
    $('go').disabled = false;
  }
}
$('go').onclick = upload;
