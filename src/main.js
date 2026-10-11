import './style.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const rupiah = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(value);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const FALLBACK_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="400"><rect width="100%" height="100%" fill="#e7e9e8"/><text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#667076">GatgetVins</text></svg>',
)}`;

const safeImage = (url) => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : FALLBACK_IMAGE;
  } catch {
    return FALLBACK_IMAGE;
  }
};

let products = [];
let activeFilter = 'Semua';
let toastTimer;
let cart = [];

try {
  const saved = JSON.parse(localStorage.getItem('gatgetvins-cart') || '[]');
  if (Array.isArray(saved)) {
    cart = saved.filter((item) => item && Number.isFinite(item.price) &&
      Number.isInteger(item.quantity) && item.quantity > 0);
  }
} catch {
  cart = [];
}

const productGrid = document.querySelector('#product-grid');
const productFilters = document.querySelector('#product-filters');
const productCount = document.querySelector('#product-count');
const cartCount = document.querySelector('#cart-count');
const cartDrawer = document.querySelector('#cart-drawer');
const cartOverlay = document.querySelector('#cart-overlay');
const cartItems = document.querySelector('#cart-items');
const cartTotal = document.querySelector('#cart-total');
const toast = document.querySelector('#toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('opacity-0', 'translate-y-4');
  toast.classList.add('opacity-100', 'translate-y-0');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'translate-y-4');
  }, 2600);
}

function renderFilters() {
  const categories = ['Semua', ...new Set(products.map((product) => product.category))];
  productFilters.innerHTML = categories.map((category) => {
    const isActive = category === activeFilter;
    return `<button type="button" data-filter="${escapeHtml(category)}"
      aria-pressed="${isActive}" class="rounded-full border px-5 py-2.5 text-xs font-bold transition
      ${isActive ? 'border-ink bg-ink text-white' : 'border-[#e0e3df] bg-white text-[#6a7479] hover:border-brand hover:text-brand'}">
      ${escapeHtml(category)}</button>`;
  }).join('');
}

function productCard(product) {
  const discounted = Number(product.originalPrice) > Number(product.price);
  return `
    <article class="product-card overflow-hidden rounded-[22px] border border-[#eaece8] bg-white">
      <div class="relative aspect-[1.1] overflow-hidden bg-[#f0f1ee]">
        <img src="${escapeHtml(safeImage(product.image))}" alt="${escapeHtml(product.name)}"
          loading="lazy" class="product-image h-full w-full object-cover" />
        ${product.badge ? `<span class="absolute left-4 top-4 rounded-full bg-white px-3 py-1.5 text-[10px] font-extrabold tracking-wide text-ink shadow-sm">${escapeHtml(product.badge)}</span>` : ''}
      </div>
      <div class="p-5">
        <p class="text-[10px] font-extrabold uppercase tracking-[.16em] text-brand">${escapeHtml(product.category)}</p>
        <h3 class="mt-2 min-h-[46px] text-[15px] font-extrabold leading-6 text-ink">${escapeHtml(product.name)}</h3>
        <p class="mt-2 min-h-[40px] text-xs leading-5 text-muted">${escapeHtml(product.description)}</p>
        <div class="mt-4 flex min-h-12 flex-col gap-1">
          <strong class="text-base font-extrabold">${rupiah(product.price)}</strong>
          ${discounted ? `<span class="text-[11px] text-[#99a0a3] line-through">${rupiah(product.originalPrice)}</span>` : '<span class="text-[11px] text-transparent" aria-hidden="true">—</span>'}
        </div>
        <button type="button" data-add-to-cart="${escapeHtml(product.id)}"
          class="button-lift mt-4 flex w-full items-center justify-center gap-3 rounded-full bg-ink py-3.5 text-xs font-bold text-white hover:bg-brand">
          <span aria-hidden="true">＋</span> Add to Cart
        </button>
      </div>
    </article>`;
}

function renderProducts() {
  const visible = activeFilter === 'Semua'
    ? products : products.filter((product) => product.category === activeFilter);
  productCount.textContent = String(visible.length);
  productGrid.innerHTML = visible.length
    ? visible.map(productCard).join('')
    : '<p class="col-span-full rounded-2xl bg-white p-10 text-center text-sm text-muted">Belum ada produk dalam kategori ini.</p>';
}

async function loadProducts() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/products`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Format produk tidak valid');
    products = data;
    renderFilters();
    renderProducts();
  } catch (error) {
    console.error('Gagal memuat produk:', error);
    productCount.textContent = '0';
    productGrid.innerHTML = `<div class="col-span-full rounded-2xl border border-[#eed4bc] bg-white p-8 text-center">
      <p class="text-base font-extrabold">Produk belum dapat ditampilkan</p>
      <p class="mt-2 text-sm text-muted">Pastikan backend Express berjalan di ${escapeHtml(API_BASE_URL)}.</p>
      <button type="button" id="retry-products" class="mt-5 rounded-full bg-ink px-6 py-3 text-xs font-bold text-white">Coba lagi</button>
    </div>`;
  }
}

function saveCart() {
  try { localStorage.setItem('gatgetvins-cart', JSON.stringify(cart)); }
  catch (error) { console.warn('Penyimpanan keranjang tidak tersedia:', error); }
  renderCart();
}

function addToCart(id) {
  const product = products.find((item) => String(item.id) === String(id));
  if (!product) return;
  const existing = cart.find((item) => String(item.id) === String(id));
  if (existing) existing.quantity += 1;
  else cart.push({ id: product.id, name: product.name, price: product.price, image: product.image, quantity: 1 });
  saveCart();
  showToast(`${product.name} ditambahkan ke keranjang`);
}

function renderCart() {
  cartCount.textContent = String(cart.reduce((total, item) => total + item.quantity, 0));
  cartTotal.textContent = rupiah(cart.reduce((total, item) => total + item.price * item.quantity, 0));
  if (!cart.length) {
    cartItems.innerHTML = '<div class="rounded-2xl bg-cream p-8 text-center text-sm text-muted">Keranjang masih kosong. Yuk, pilih gadget favorit!</div>';
    return;
  }
  cartItems.innerHTML = cart.map((item) => `
    <div class="flex gap-4 border-b border-[#eeefec] pb-5">
      <img src="${escapeHtml(safeImage(item.image))}" alt="${escapeHtml(item.name)}" class="size-20 rounded-xl bg-[#f2f2ee] object-cover" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-extrabold">${escapeHtml(item.name)}</p>
        <p class="mt-1 text-xs font-semibold text-brand">${rupiah(item.price)}</p>
        <div class="mt-3 flex items-center justify-between gap-2">
          <div class="flex items-center gap-3 rounded-full border border-[#e6e8e5] px-3 py-1 text-sm">
            <button type="button" data-cart-action="minus" data-id="${escapeHtml(item.id)}" aria-label="Kurangi ${escapeHtml(item.name)}">−</button>
            <span>${item.quantity}</span>
            <button type="button" data-cart-action="plus" data-id="${escapeHtml(item.id)}" aria-label="Tambah ${escapeHtml(item.name)}">+</button>
          </div>
          <button type="button" data-cart-action="remove" data-id="${escapeHtml(item.id)}" class="text-xs font-bold text-red-600">Hapus</button>
        </div>
      </div>
    </div>`).join('');
}

function setCartOpen(open) {
  cartDrawer.classList.toggle('hidden', !open);
  cartOverlay.classList.toggle('hidden', !open);
  cartOverlay.setAttribute('aria-hidden', String(!open));
  document.body.classList.toggle('overflow-hidden', open);
  if (open) document.querySelector('#cart-close').focus();
  else document.querySelector('#cart-button').focus();
}

document.querySelector('#cart-button').addEventListener('click', () => setCartOpen(true));
document.querySelector('#cart-close').addEventListener('click', () => setCartOpen(false));
cartOverlay.addEventListener('click', () => setCartOpen(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !cartDrawer.classList.contains('hidden')) setCartOpen(false);
});

cartItems.addEventListener('click', (event) => {
  const button = event.target.closest('[data-cart-action]');
  if (!button) return;
  const index = cart.findIndex((item) => String(item.id) === button.dataset.id);
  if (index === -1) return;
  const action = button.dataset.cartAction;
  if (action === 'plus') cart[index].quantity += 1;
  if (action === 'minus') cart[index].quantity -= 1;
  if (action === 'remove' || cart[index].quantity <= 0) cart.splice(index, 1);
  saveCart();
});

productGrid.addEventListener('click', (event) => {
  if (event.target.id === 'retry-products') return loadProducts();
  const button = event.target.closest('[data-add-to-cart]');
  if (button) addToCart(button.dataset.addToCart);
});

productFilters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  activeFilter = button.dataset.filter;
  renderFilters();
  renderProducts();
});

// Delegasi penanganan bila gambar produk dari URL eksternal gagal dimuat.
document.addEventListener('error', (event) => {
  const image = event.target;
  if (image instanceof HTMLImageElement && !image.dataset.fallback) {
    image.dataset.fallback = 'true';
    image.src = FALLBACK_IMAGE;
  }
}, true);

const menuButton = document.querySelector('#menu-button');
const mobileMenu = document.querySelector('#mobile-menu');
menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  mobileMenu.classList.toggle('hidden', isOpen);
});
mobileMenu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  mobileMenu.classList.add('hidden');
  menuButton.setAttribute('aria-expanded', 'false');
}));

const contactForm = document.querySelector('#contact-form');
const formStatus = document.querySelector('#form-status');
const contactSubmit = document.querySelector('#contact-submit');
contactForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!contactForm.reportValidity()) return;
  const payload = Object.fromEntries(new FormData(contactForm));
  contactSubmit.disabled = true;
  contactSubmit.textContent = 'Mengirim...';
  formStatus.textContent = '';
  formStatus.className = 'text-xs font-semibold';
  try {
    const response = await fetch(`${API_BASE_URL}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Gagal mengirim pesan');
    formStatus.textContent = data.message;
    formStatus.classList.add('text-green-700');
    contactForm.reset();
  } catch (error) {
    formStatus.textContent = error.message || 'Server sedang tidak dapat dihubungi.';
    formStatus.classList.add('text-red-600');
  } finally {
    contactSubmit.disabled = false;
    contactSubmit.innerHTML = 'Send Message <span class="ml-3">↗</span>';
  }
});

document.querySelector('#year').textContent = String(new Date().getFullYear());
renderCart();
loadProducts();
