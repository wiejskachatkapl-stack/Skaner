const totalProductsEl = document.getElementById("totalProducts");
const goodProductsEl = document.getElementById("goodProducts");
const withPhotosEl = document.getElementById("withPhotos");
const productsGrid = document.getElementById("productsGrid");
const emptyState = document.getElementById("emptyState");
const featuredRow = document.getElementById("featuredRow");
const productSearch = document.getElementById("productSearch");
const clearCatalogBtn = document.getElementById("clearCatalogBtn");

let currentItems = [];
let renderedItems = [];

function renderStats(items) {
  totalProductsEl.textContent = items.length;
  goodProductsEl.textContent = items.filter(item => (item.rating?.points || 0) >= 8).length;
  withPhotosEl.textContent = items.filter(item => item.image && item.image !== PLACEHOLDER_IMAGE).length;
}

function renderFeatured(items) {
  if (!items.length) {
    featuredRow.innerHTML = "";
    return;
  }
  const latest = items[0];
  featuredRow.innerHTML = `
    <section class="card featured-card">
      <div class="featured-media">
        <img src="${escapeHtml(latest.image || PLACEHOLDER_IMAGE)}" alt="${escapeHtml(latest.name)}" onerror="this.src='${PLACEHOLDER_IMAGE}'" />
      </div>
      <div class="featured-copy">
        <p class="eyebrow">OSTATNIO ZESKANOWANE</p>
        <h2>${escapeHtml(latest.name)}</h2>
        <p class="muted">${escapeHtml(latest.brand || 'Marka nieznana')} · Kod ${escapeHtml(latest.code)}</p>
        <button class="rating-box rating-click ${latest.rating?.className || 'rating-mid'}" id="featuredRatingBtn" type="button">${escapeHtml(ratingText(latest.rating || { points: 5, label: 'Średni wybór' }))}</button>
        <div class="mini-grid spacious">${nutritionPreviewHtml(latest.nutriments || {})}</div>
      </div>
    </section>
  `;
  const featuredBtn = document.getElementById("featuredRatingBtn");
  if (featuredBtn) featuredBtn.addEventListener("click", () => openAnalysisModal(latest));
}

function renderCatalog(items) {
  renderStats(items);
  renderFeatured(items);

  if (!items.length) {
    productsGrid.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  renderedItems = items;
  productsGrid.innerHTML = items.map(productCardTemplate).join("");
  productsGrid.querySelectorAll("[data-analysis-code]").forEach(btn => {
    btn.addEventListener("click", () => {
      const product = renderedItems.find(item => item.code === btn.dataset.analysisCode);
      if (product) openAnalysisModal(product);
    });
  });
}

function applyFilter() {
  const query = String(productSearch.value || "").trim().toLowerCase();
  if (!query) {
    renderCatalog(currentItems);
    return;
  }
  const filtered = currentItems.filter(item => {
    const haystack = `${item.name} ${item.brand} ${item.code}`.toLowerCase();
    return haystack.includes(query);
  });
  renderCatalog(filtered);
}

function loadCatalog() {
  const rawCatalog = getCatalog();
  currentItems = rawCatalog.map(item => {
    const rebuilt = {
      ...item,
      image: item.image || PLACEHOLDER_IMAGE,
      rating: item.rating || null
    };
    if (!rebuilt.rating || !Array.isArray(rebuilt.rating.items)) {
      rebuilt.rating = calculateRating({ nutriments: rebuilt.nutriments || {} });
    }
    return rebuilt;
  });
  renderCatalog(currentItems);
}

productSearch.addEventListener("input", applyFilter);
clearCatalogBtn.addEventListener("click", () => {
  localStorage.removeItem(CATALOG_KEY);
  loadCatalog();
});

loadCatalog();
