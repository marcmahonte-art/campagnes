/*
 * Le banc de détourage — logique de page.
 *
 * Ce fichier importe **`cutout.js`, le module compilé depuis `lib/cutout.ts`**,
 * et non une copie. C'est la raison d'être de la contrainte « zéro import » du
 * module : le banc compile le même fichier source que l'application, donc ce
 * qu'on mesure ici est exactement ce qui tournera en production. Une copie
 * aurait dérivé, et la mesure aurait porté sur autre chose que le produit.
 *
 * Le banc ne réimplémente rien : le choix du modèle, la conversion de
 * l'adoucissement, le verdict, le format CSV et les messages d'erreur viennent
 * tous du module. Ce qui reste ici est de la présentation et des appels.
 *
 * Le module compilé vit dans `build/` — un dossier déjà ignoré par git, donc
 * l'artefact de compilation ne se retrouve jamais dans un commit. Il est produit
 * par `npm run bench:cutout`, que `bench:cutout:serve` enchaîne pour vous.
 */
import {
  CUTOUT_MODELS,
  DEFAULT_CUTOUT_MODEL,
  MEASUREMENT_COLUMNS,
  MOBILE_TRANSFER_BUDGET_BYTES,
  chooseModel,
  cutoutErrorMessage,
  cutoutPhoto,
  defaultFeather,
  detectWebGpu,
  deviceLabel,
  exceedsMobileBudget,
  firstLoadBytes,
  formatBytes,
  formatMs,
  inputSize,
  measurementsToCsv,
  modelWarning,
  runtimeCost,
} from './build/cutout.js';

/* ------------------------------------------------------------------ */
/* État                                                               */
/* ------------------------------------------------------------------ */

/** @type {import('./cutout.js').CutoutMeasurements[]} */
let rows = [];
/** @type {{src: string, naturalWidth: number, naturalHeight: number} | null} */
let photo = null;
let busy = false;
let webgpuAvailable = false;

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/* Environnement                                                      */
/* ------------------------------------------------------------------ */

function fact(term, value) {
  return `<div class="fact"><dt>${term}</dt><dd>${value}</dd></div>`;
}

/** Le libellé d'appareil proposé, que la personne peut corriger. */
function suggestedLabel() {
  const ua = navigator.userAgent;
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) ? 'Opera' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) ? 'Safari' : 'navigateur inconnu';
  const version = (ua.match(/(?:Chrome|Firefox|Version|Edg)\/(\d+)/) ?? [])[1] ?? '';
  const system =
    /Android\s([\d.]+)/.test(ua) ? `Android ${ua.match(/Android\s([\d.]+)/)[1]}` :
    /iPhone|iPad/.test(ua) ? 'iOS' :
    /Windows NT/.test(ua) ? 'Windows' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Linux/.test(ua) ? 'Linux' : '';
  return [system, browser + (version ? ' ' + version : '')].filter(Boolean).join(' / ');
}

async function renderEnvironment() {
  const gpu = navigator.gpu;
  webgpuAvailable = await detectWebGpu(gpu);

  const cores = navigator.hardwareConcurrency;
  const memory = navigator.deviceMemory;
  const recommended = chooseModel(webgpuAvailable);

  $('env').innerHTML = [
    fact('Adaptateur WebGPU', webgpuAvailable ? 'accordé' : 'absent'),
    fact('Moteur retenu', recommended.runtime === 'mediapipe' ? 'MediaPipe' : 'Transformers.js'),
    fact('Modèle retenu', recommended.label),
    fact('Premier chargement', formatBytes(firstLoadBytes(recommended))),
    fact('Cœurs', cores ? String(cores) : '—'),
    fact('Mémoire annoncée', memory ? `${memory} Go` : 'non exposée'),
  ].join('');

  if (!photo) $('device').value = suggestedLabel();

  renderModels(recommended);
}

/* ------------------------------------------------------------------ */
/* Modèles                                                            */
/* ------------------------------------------------------------------ */

function renderModels(recommended) {
  const select = $('model');
  select.innerHTML =
    `<option value="">— stratégie automatique (${recommended.label}) —</option>` +
    CUTOUT_MODELS.map(
      (model) =>
        `<option value="${model.id}">${model.label} — ${formatBytes(model.approxBytes)} · ${model.licence}</option>`,
    ).join('');

  // Pré-sélectionner la stratégie : c'est le comportement réel de la production.
  select.value = '';
  renderModelCost();
}

function selectedModel() {
  const id = $('model').value;
  return id ? CUTOUT_MODELS.find((m) => m.id === id) ?? DEFAULT_CUTOUT_MODEL : chooseModel(webgpuAvailable);
}

function renderModelCost() {
  const model = selectedModel();
  const cost = runtimeCost(model.runtime);
  const parts = [
    `Moteur : ${cost ? cost.label : model.runtime} — ${cost ? formatBytes(cost.minWasmBytes) : '—'}`,
    `poids : ${formatBytes(model.approxBytes)}`,
    `total au premier chargement : ${formatBytes(firstLoadBytes(model))}`,
  ];
  $('modelcost').textContent = parts.join(' · ');

  const warning = modelWarning(model);
  $('modelwarn').textContent = warning ?? '';

  // L'adoucissement recommandé suit le moteur : le remettre à sa valeur à chaque
  // changement de modèle évite de comparer deux choses à la fois.
  const feather = defaultFeather(model);
  $('feather').value = String(feather);
  $('featherout').textContent = String(feather);
}

/* ------------------------------------------------------------------ */
/* Photo                                                              */
/* ------------------------------------------------------------------ */

function loadPhoto(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    setStatus('Ce fichier n’est pas une image.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => setStatus('Cette image n’a pas pu être lue.', 'error');
  reader.onload = () => {
    const src = String(reader.result);
    const image = new Image();
    image.onload = () => {
      photo = { src, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
      $('originbox').innerHTML = `<img src="${src}" alt="Photo d’origine" />`;
      $('resultbox').innerHTML = '<div class="empty">Détourage</div>';
      $('run').disabled = false;
      const size = inputSize(photo.naturalWidth, photo.naturalHeight);
      setStatus(
        `Photo chargée : ${photo.naturalWidth}×${photo.naturalHeight} px. ` +
          (size.resized
            ? `L’entrée du modèle sera réduite à ${size.width}×${size.height} ; la sortie garde la pleine résolution.`
            : 'Elle passe au modèle telle quelle.'),
      );
      $('raw').textContent = '';
    };
    image.onerror = () => setStatus('Cette image n’a pas pu être décodée.', 'error');
    image.src = src;
  };
  reader.readAsDataURL(file);
}

/* ------------------------------------------------------------------ */
/* Détourage                                                          */
/* ------------------------------------------------------------------ */

function setStatus(message, kind = '') {
  const status = $('status');
  status.textContent = message;
  status.className = kind;
}

function setBusy(value) {
  busy = value;
  $('run').disabled = value || !photo;
  $('run').textContent = value ? 'Détourage…' : 'Détourer';
}

async function run() {
  if (busy || !photo) return;

  const model = selectedModel();
  setBusy(true);
  setStatus('Préparation…');
  $('raw').textContent = '';

  try {
    const result = await cutoutPhoto(photo, {
      // Forcé explicitement : le banc doit mesurer le modèle affiché, pas celui
      // que la stratégie aurait choisi à sa place.
      modelId: model.id,
      deviceLabel: $('device').value.trim(),
      featherPx: Number($('feather').value),
      onProgress: (progress) => setStatus(progress.message),
    });

    showResult(result, model);
    rows.push(result.measurements);
    renderTable();
    setStatus(
      `Détouré en ${formatMs(result.measurements.totalMs)} — ${result.quality.message}`,
      result.quality.verdict === 'ok' ? 'ok' : 'error',
    );
  } catch (error) {
    /*
     * Les deux messages, et pas seulement celui du participant. Le banc doit
     * montrer l'erreur brute — c'est elle qui dit quoi corriger — en plus de
     * vérifier que la traduction destinée au participant est bien actionnable.
     */
    setStatus(cutoutErrorMessage(error), 'error');
    $('raw').textContent = `Message montré au participant :\n${cutoutErrorMessage(error)}\n\nErreur brute :\n${describe(error)}`;
  } finally {
    setBusy(false);
  }
}

function describe(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}\n${error.stack ?? ''}`;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function showResult(result, model) {
  const { measurements } = result;
  $('resultbox').innerHTML = `<img src="${result.src}" alt="Détourage" />`;

  const lines = [
    ['Modèle', model.label],
    ['Moteur', measurements.device === 'webgl' ? 'MediaPipe' : 'Transformers.js'],
    ['Chemin', deviceLabel(measurements.device)],
    ['Version', measurements.libraryVersion || 'non exposée'],
    ['Entrée du modèle', `${measurements.inputWidth}×${measurements.inputHeight} px`],
    ['Sortie', `${measurements.outputWidth}×${measurements.outputHeight} px`],
    ['Chargement du modèle', formatMs(measurements.loadMs)],
    ['Inférence', formatMs(measurements.inferenceMs)],
    ['Total', formatMs(measurements.totalMs)],
    [
      'Téléchargé',
      measurements.transferredBytes == null
        ? 'non exposé par le navigateur'
        : formatBytes(measurements.transferredBytes),
    ],
    ['Mémoire JS', formatBytes(measurements.memoryBytes)],
    ['Sujet opaque', `${(measurements.opaqueRatio * 100).toFixed(1)} %`],
    /*
     * Le verdict de budget est affiché **à côté de la mesure**, et non dans un
     * document : c'est la question à laquelle le banc doit répondre. Le budget
     * est de 10 Mo (décision du 2026-10-10) ; aucun moteur du registre n'entre
     * dedans, donc l'accord du participant est requis sur connexion facturée.
     */
    [
      `Budget mobile (${formatBytes(MOBILE_TRANSFER_BUDGET_BYTES)})`,
      exceedsMobileBudget(model)
        ? `hors budget — ${formatBytes(firstLoadBytes(model))} → accord demandé sur forfait`
        : `dans le budget — ${formatBytes(firstLoadBytes(model))}`,
    ],
  ];

  $('raw').innerHTML =
    lines.map(([k, v]) => `${k} : ${v}`).join('\n') +
    `\n\nVerdict : <span class="verdict ${measurements.verdict}">${measurements.verdict}</span> — ${result.quality.message}`;
}

/* ------------------------------------------------------------------ */
/* Mesures                                                            */
/* ------------------------------------------------------------------ */

function cell(column, row) {
  const value = row[column.key];
  if (column.key === 'transferredBytes' || column.key === 'memoryBytes') {
    return value == null ? '—' : formatBytes(Number(value));
  }
  if (column.key === 'loadMs' || column.key === 'inferenceMs' || column.key === 'totalMs') {
    return formatMs(Number(value));
  }
  if (column.key === 'opaqueRatio') return `${(Number(value) * 100).toFixed(1)} %`;
  if (column.key === 'at') return String(value).replace('T', ' ').slice(0, 19);
  return String(value ?? '');
}

function renderTable() {
  const table = $('table');
  if (rows.length === 0) {
    table.innerHTML = '<tbody><tr><td class="note">Aucune mesure.</td></tr></tbody>';
    $('download').disabled = true;
    return;
  }

  const head =
    '<thead><tr>' +
    MEASUREMENT_COLUMNS.map((c) => `<th>${c.label}</th>`).join('') +
    '</tr></thead>';
  const body =
    '<tbody>' +
    rows
      .map(
        (row) =>
          '<tr>' +
          MEASUREMENT_COLUMNS.map(
            (c) =>
              `<td class="${['loadMs', 'inferenceMs', 'totalMs', 'opaqueRatio', 'transferredBytes', 'memoryBytes'].includes(c.key) ? 'num' : ''}">${cell(c, row)}</td>`,
          ).join('') +
          '</tr>',
      )
      .join('') +
    '</tbody>';

  table.innerHTML = head + body;
  $('download').disabled = false;
}

async function copyCsv() {
  const csv = measurementsToCsv(rows);
  try {
    await navigator.clipboard.writeText(csv);
    setStatus('CSV copié dans le presse-papier.', 'ok');
  } catch {
    // Le presse-papier exige un contexte sécurisé ; en HTTP simple il est refusé.
    // On montre le CSV plutôt que d'échouer en silence.
    $('raw').textContent = csv;
    setStatus('Copie refusée par le navigateur — le CSV est affiché ci-dessus.', 'error');
  }
}

function downloadCsv() {
  const blob = new Blob([measurementsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `detourage-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Branchements                                                       */
/* ------------------------------------------------------------------ */

const drop = $('drop');
drop.addEventListener('click', () => $('file').click());
drop.addEventListener('dragover', (event) => {
  event.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (event) => {
  event.preventDefault();
  drop.classList.remove('over');
  loadPhoto(event.dataTransfer?.files?.[0]);
});

$('file').addEventListener('change', (event) => loadPhoto(event.target.files?.[0]));
$('model').addEventListener('change', renderModelCost);
$('feather').addEventListener('input', (event) => {
  $('featherout').textContent = event.target.value;
});
$('run').addEventListener('click', run);
$('csv').addEventListener('click', copyCsv);
$('download').addEventListener('click', downloadCsv);
$('clear').addEventListener('click', () => {
  rows = [];
  renderTable();
  setStatus('Mesures effacées.');
  $('raw').textContent = '';
});

$('clear').disabled = false;

void renderEnvironment();
