const VERSION = "SKANER PRODUKTÓW v1003";
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

function calculateRating(product) {
  const n = product.nutriments || {};
  const sugar = Number(n["sugars_100g"]);
  const salt = Number(n["salt_100g"]);
  const saturated = Number(n["saturated-fat_100g"]);
  const fiber = Number(n["fiber_100g"]);
  const protein = Number(n["proteins_100g"]);

  let points = 5;
  const notes = [];

  if (Number.isFinite(sugar)) {
    if (sugar > 15) { points -= 2; notes.push("dużo cukru"); }
    else if (sugar > 7) { points -= 1; notes.push("średnio cukru"); }
    else { points += 1; notes.push("mało cukru"); }
  }

  if (Number.isFinite(salt)) {
    if (salt > 1.5) { points -= 2; notes.push("dużo soli"); }
    else if (salt > 0.7) { points -= 1; notes.push("średnio soli"); }
    else { points += 1; notes.push("mało soli"); }
  }

  if (Number.isFinite(saturated) && saturated > 5) {
    points -= 1;
    notes.push("więcej tłuszczów nasyconych");
  }

  if (Number.isFinite(fiber) && fiber >= 3) {
    points += 1;
    notes.push("dobry błonnik");
  }

  if (Number.isFinite(protein) && protein >= 10) {
    points += 1;
    notes.push("sporo białka");
  }

  points = Math.max(1, Math.min(10, points));

  let label = "Średni wybór";
  let className = "rating-mid";
  if (points >= 8) { label = "Dobry wybór"; className = "rating-good"; }
  if (points <= 4) { label = "Słaby wybór"; className = "rating-bad"; }

  return { points, label, className, notes };
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
        <div class="rating-box compact ${item.rating?.className || 'rating-mid'}">${escapeHtml(ratingText(item.rating || { points: 5, label: 'Średni wybór' }))}</div>
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
