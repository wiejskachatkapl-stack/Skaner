const VERSION = "SKANER PRODUKTÓW v1007";
const API_BASE = "https://world.openfoodfacts.org/api/v2/product/";
const API_FIELDS = [
  "code",
  "product_name",
  "brands",
  "image_front_url",
  "image_front_small_url",
  "image_url",
  "nutriments",
  "ingredients_text_pl",
  "ingredients_text",
  "allergens",
  "allergens_tags",
  "nutriscore_grade"
].join(",");

const HISTORY_KEY = "productScannerHistory";
const CATALOG_KEY = "productScannerCatalog";
const PLACEHOLDER_IMAGE = "assets/product-placeholder.svg";

const nutritionMap = [
  ["Energia", "energy-kcal_100g", "kcal"],
  ["Tłuszcz", "fat_100g", "g"],
  ["Kwasy nasycone", "saturated-fat_100g", "g"],
  ["Węglowodany", "carbohydrates_100g", "g"],
  ["Cukry", "sugars_100g", "g"],
  ["Błonnik", "fiber_100g", "g"],
  ["Białko", "proteins_100g", "g"],
  ["Sól", "salt_100g", "g"]
];

function sanitizeBarcode(value) {
  return String(value || "").replace(/[^0-9]/g, "").trim();
}

function formatValue(value, unit) {
  if (value === undefined || value === null || value === "") return "brak";
  const number = Number(value);
  if (Number.isFinite(number)) {
    return `${String(Math.round(number * 100) / 100).replace(".", ",")} ${unit}`;
  }
  return `${value} ${unit}`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text || "");
  return div.innerHTML;
}

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getHistory() {
  return readStorage(HISTORY_KEY);
}

function getCatalog() {
  return readStorage(CATALOG_KEY);
}

function normalizeProductImage(product) {
  return product.image_front_url || product.image_front_small_url || product.image_url || PLACEHOLDER_IMAGE;
}

function formatAllergens(product) {
  if (product.allergens) return String(product.allergens).replaceAll("en:", "").replaceAll(",", ", ");
  if (Array.isArray(product.allergens_tags) && product.allergens_tags.length) {
    return product.allergens_tags.map(a => a.replace("en:", "")).join(", ");
  }
  return "Brak danych.";
}

function scoreItem({ label, value, unit, type, goodText, midText, badText, missingText }) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return {
      label,
      value: "brak danych",
      score: 0,
      level: "unknown",
      verdict: missingText || "Brak danych do oceny tego składnika.",
      good: false,
      bad: false
    };
  }

  let score = 5;
  let level = "mid";
  let verdict = midText || "Wartość umiarkowana.";

  if (type === "sugar") {
    if (number <= 5) { score = 9; level = "good"; verdict = goodText || "Niska zawartość cukru."; }
    else if (number <= 10) { score = 6; level = "mid"; verdict = midText || "Cukru jest umiarkowanie."; }
    else if (number <= 15) { score = 4; level = "bad"; verdict = "Cukru jest dość dużo."; }
    else { score = 2; level = "bad"; verdict = badText || "Dużo cukru — warto uważać."; }
  }

  if (type === "salt") {
    if (number <= 0.3) { score = 9; level = "good"; verdict = goodText || "Niska zawartość soli."; }
    else if (number <= 0.7) { score = 7; level = "good"; verdict = "Soli jest raczej mało."; }
    else if (number <= 1.5) { score = 5; level = "mid"; verdict = midText || "Soli jest umiarkowanie."; }
    else { score = 2; level = "bad"; verdict = badText || "Dużo soli — produkt lepiej ograniczać."; }
  }

  if (type === "saturated") {
    if (number <= 1.5) { score = 9; level = "good"; verdict = goodText || "Mało tłuszczów nasyconych."; }
    else if (number <= 5) { score = 6; level = "mid"; verdict = midText || "Tłuszczów nasyconych jest umiarkowanie."; }
    else { score = 3; level = "bad"; verdict = badText || "Dużo tłuszczów nasyconych."; }
  }

  if (type === "fiber") {
    if (number >= 6) { score = 10; level = "good"; verdict = goodText || "Bardzo dobra ilość błonnika."; }
    else if (number >= 3) { score = 8; level = "good"; verdict = "Dobry błonnik."; }
    else if (number > 0) { score = 5; level = "mid"; verdict = midText || "Błonnika jest niewiele."; }
    else { score = 3; level = "bad"; verdict = badText || "Brak lub bardzo mało błonnika."; }
  }

  if (type === "protein") {
    if (number >= 20) { score = 10; level = "good"; verdict = goodText || "Bardzo dużo białka."; }
    else if (number >= 10) { score = 8; level = "good"; verdict = "Dobra ilość białka."; }
    else if (number >= 5) { score = 6; level = "mid"; verdict = midText || "Białka jest umiarkowanie."; }
    else { score = 4; level = "bad"; verdict = badText || "Mało białka."; }
  }

  if (type === "energy") {
    if (number <= 120) { score = 8; level = "good"; verdict = goodText || "Niska kaloryczność."; }
    else if (number <= 250) { score = 6; level = "mid"; verdict = midText || "Kaloryczność umiarkowana."; }
    else if (number <= 450) { score = 4; level = "bad"; verdict = "Produkt jest dość kaloryczny."; }
    else { score = 2; level = "bad"; verdict = badText || "Bardzo kaloryczny produkt."; }
  }

  return {
    label,
    value: formatValue(number, unit),
    rawValue: number,
    score,
    level,
    verdict,
    good: level === "good",
    bad: level === "bad"
  };
}

function analyzeProduct(product) {
  const n = product.nutriments || {};
  const items = [
    scoreItem({ label: "Kalorie", value: n["energy-kcal_100g"], unit: "kcal", type: "energy" }),
    scoreItem({ label: "Cukry", value: n["sugars_100g"], unit: "g", type: "sugar" }),
    scoreItem({ label: "Sól", value: n["salt_100g"], unit: "g", type: "salt" }),
    scoreItem({ label: "Tłuszcze nasycone", value: n["saturated-fat_100g"], unit: "g", type: "saturated" }),
    scoreItem({ label: "Błonnik", value: n["fiber_100g"], unit: "g", type: "fiber" }),
    scoreItem({ label: "Białko", value: n["proteins_100g"], unit: "g", type: "protein" })
  ];

  const scored = items.filter(item => item.score > 0);
  const average = scored.length
    ? Math.round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length)
    : 5;

  const good = items
    .filter(item => item.good)
    .map(item => `${item.label}: ${item.verdict}`);

  const bad = items
    .filter(item => item.bad)
    .map(item => `${item.label}: ${item.verdict}`);

  const neutral = items
    .filter(item => item.level === "mid")
    .map(item => `${item.label}: ${item.verdict}`);

  let label = "Średni wybór";
  let className = "rating-mid";
  if (average >= 8) { label = "Dobry wybór"; className = "rating-good"; }
  if (average <= 4) { label = "Słaby wybór"; className = "rating-bad"; }

  return {
    points: Math.max(1, Math.min(10, average)),
    label,
    className,
    items,
    good,
    bad,
    neutral,
    notes: [...good.slice(0, 2), ...bad.slice(0, 2)]
  };
}

function calculateRating(product) {
  return analyzeProduct(product);
}

function buildStoredProduct(product, barcode) {
  const rating = calculateRating(product);
  return {
    code: barcode,
    name: product.product_name || "Produkt bez nazwy",
    brand: product.brands || "Marka nieznana",
    image: normalizeProductImage(product),
    nutriments: product.nutriments || {},
    ingredients: product.ingredients_text_pl || product.ingredients_text || "Brak danych.",
    allergens: formatAllergens(product),
    nutriScore: product.nutriscore_grade ? String(product.nutriscore_grade).toUpperCase() : "-",
    rating,
    date: new Date().toISOString()
  };
}

function saveToHistory(storedProduct) {
  const history = getHistory().filter(item => item.code !== storedProduct.code);
  history.unshift({
    code: storedProduct.code,
    name: storedProduct.name,
    brand: storedProduct.brand,
    image: storedProduct.image,
    rating: storedProduct.rating,
    date: storedProduct.date
  });
  writeStorage(HISTORY_KEY, history.slice(0, 12));
}

function saveToCatalog(storedProduct) {
  const catalog = getCatalog().filter(item => item.code !== storedProduct.code);
  catalog.unshift(storedProduct);
  writeStorage(CATALOG_KEY, catalog.slice(0, 100));
}

function nutritionPreviewHtml(nutriments) {
  const previewMap = [
    ["Kalorie", "energy-kcal_100g", "kcal"],
    ["Białko", "proteins_100g", "g"],
    ["Cukry", "sugars_100g", "g"],
    ["Sól", "salt_100g", "g"]
  ];
  return previewMap.map(([label, key, unit]) => {
    return `<div class="mini-nutrient"><span>${label}</span><strong>${formatValue(nutriments?.[key], unit)}</strong></div>`;
  }).join("");
}

function ratingText(rating) {
  return `${rating.points}/10 — ${rating.label}`;
}

function levelLabel(level) {
  if (level === "good") return "dobre";
  if (level === "bad") return "słabe";
  if (level === "unknown") return "brak danych";
  return "średnie";
}

function analysisBlockHtml(item) {
  const levelClass = item.level || "unknown";
  return `
    <div class="analysis-item ${levelClass}">
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.verdict)}</span>
      </div>
      <div class="analysis-score">
        <b>${item.score ? item.score + "/10" : "-"}</b>
        <small>${escapeHtml(item.value)}</small>
      </div>
    </div>
  `;
}

function analysisPanelHtml(item) {
  const rating = item.rating || {
    points: 5,
    label: "Średni wybór",
    className: "rating-mid",
    items: [],
    good: [],
    bad: [],
    neutral: []
  };

  const goodHtml = (rating.good && rating.good.length)
    ? rating.good.map(text => `<li>${escapeHtml(text)}</li>`).join("")
    : `<li>Brak wyraźnych plusów w dostępnych danych.</li>`;

  const badHtml = (rating.bad && rating.bad.length)
    ? rating.bad.map(text => `<li>${escapeHtml(text)}</li>`).join("")
    : `<li>Brak dużych minusów w dostępnych danych.</li>`;

  const neutralHtml = (rating.neutral && rating.neutral.length)
    ? `<div class="analysis-section"><h4>Neutralne / średnie</h4><ul>${rating.neutral.map(text => `<li>${escapeHtml(text)}</li>`).join("")}</ul></div>`
    : "";

  const itemsHtml = (rating.items || []).map(analysisBlockHtml).join("");

  return `
    <div class="analysis-panel">
      <div class="analysis-head">
        <div>
          <p class="eyebrow">SZCZEGÓŁOWA OCENA</p>
          <h3>${escapeHtml(item.name || "Produkt")}</h3>
          <p class="muted">${escapeHtml(item.brand || "")} · Kod ${escapeHtml(item.code || "")}</p>
        </div>
        <div class="rating-box ${rating.className || "rating-mid"}">${escapeHtml(ratingText(rating))}</div>
      </div>

      <div class="analysis-columns">
        <div class="analysis-section good-list">
          <h4>Co jest dobre</h4>
          <ul>${goodHtml}</ul>
        </div>
        <div class="analysis-section bad-list">
          <h4>Co jest złe</h4>
          <ul>${badHtml}</ul>
        </div>
      </div>

      ${neutralHtml}

      <div class="analysis-section">
        <h4>Oceny poszczególnych składników</h4>
        <div class="analysis-grid">${itemsHtml}</div>
      </div>

      <p class="analysis-note">Ocena jest uproszczona i opiera się na danych w 100 g / 100 ml z bazy produktu. To pomoc zakupowa, a nie porada medyczna.</p>
    </div>
  `;
}

function createAnalysisModal() {
  let modal = document.getElementById("analysisModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "analysisModal";
  modal.className = "analysis-modal hidden";
  modal.innerHTML = `
    <div class="analysis-backdrop" data-close-analysis="1"></div>
    <div class="analysis-dialog">
      <button class="analysis-close" data-close-analysis="1">×</button>
      <div id="analysisModalContent"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("click", event => {
    if (event.target.dataset.closeAnalysis) {
      closeAnalysisModal();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeAnalysisModal();
  });

  return modal;
}

function openAnalysisModal(item) {
  const modal = createAnalysisModal();
  const content = modal.querySelector("#analysisModalContent");
  content.innerHTML = analysisPanelHtml(item);
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeAnalysisModal() {
  const modal = document.getElementById("analysisModal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function productCardTemplate(item) {
  return `
    <article class="product-card">
      <div class="product-card-media">
        <img src="${escapeHtml(item.image || PLACEHOLDER_IMAGE)}" alt="${escapeHtml(item.name)}" onerror="this.src='${PLACEHOLDER_IMAGE}'" />
      </div>
      <div class="product-card-body">
        <div class="card-topline">
          <span class="pill">${escapeHtml(item.brand || 'Produkt')}</span>
          <span class="pill subtle">Kod ${escapeHtml(item.code)}</span>
        </div>
        <h3>${escapeHtml(item.name)}</h3>
        <button class="rating-box compact rating-click ${item.rating?.className || 'rating-mid'}" data-analysis-code="${escapeHtml(item.code)}" type="button">${escapeHtml(ratingText(item.rating || { points: 5, label: 'Średni wybór' }))}</button>
        <div class="mini-grid">${nutritionPreviewHtml(item.nutriments || {})}</div>
        <details class="product-details">
          <summary>Szczegóły produktu</summary>
          <div class="details-inner">
            <p><strong>Skład:</strong> ${escapeHtml(item.ingredients || 'Brak danych.')}</p>
            <p><strong>Alergeny:</strong> ${escapeHtml(item.allergens || 'Brak danych.')}</p>
            <p><strong>Nutri-Score:</strong> ${escapeHtml(item.nutriScore || '-')}</p>
          </div>
        </details>
      </div>
    </article>
  `;
}
