// ╔══════════════════════════════════════════════════════╗
// ║  CONFIGURACIÓN — edita solo esta sección            ║
// ╚══════════════════════════════════════════════════════╝
const CONFIG = {
  nombreFisio : "Diana Gisel",
  negocio     : "DG Bienestar y Belleza",
  whatsapp    : "523312345678",   // ← pon el número real de Diana (52 + 10 dígitos)
  duracionMin : 60,
  pin         : "0922",

  // URL del Web App de Google Apps Script — se llena en el paso 3 de la guía
  sheetURL: "https://script.google.com/macros/s/AKfycbzr7QAoSGJ-mQ_sJfqVew-1iYR492xhhk2FqdSUtO0Ti5gT4W2pDvvyWgUI2g1UGq2r/exec",   // ← pega aquí la URL después de publicar el script

  horarios: {
    0: [9, 20],    // Domingo   9am–8pm
    1: [16, 20],   // Lunes     4pm–8pm
    2: [16, 20],   // Martes    4pm–8pm
    3: [16, 20],   // Miércoles 4pm–8pm
    4: [16, 20],   // Jueves    4pm–8pm
    5: [16, 20],   // Viernes   4pm–8pm
    6: [9, 20],    // Sábado    9am–8pm
  },
};

// ╔══════════════════════════════════════════════════════╗
// ║  SERVICIOS                                          ║
// ╚══════════════════════════════════════════════════════╝
const SERVICIOS = {
  fisio: [
    "Prevención de dolores y recuperación de lesiones",
    "Dolor lumbar",
    "Dolor en cuello y hombros",
    "Terapia manual",
    "Ejercicio terapéutico",
    "Esguinces",
    "Parálisis facial",
    "Masaje terapéutico / relajante / descontracturante",
  ],
  estetica: [
    "Laminado de cejas",
    "Visagismo",
    "Pigmento",
    "Depilación con pinza o navaja",
    "Rizado de pestañas",
  ],
};

// ╔══════════════════════════════════════════════════════╗
// ║  ESTADO GLOBAL                                      ║
// ╚══════════════════════════════════════════════════════╝
let appointments    = [];
let diasBloqueados  = new Set();   // "YYYY-MM-DD"
let viewDate        = new Date();
let selectedDate    = null;
let isLoggedIn      = false;

// ╔══════════════════════════════════════════════════════╗
// ║  API GOOGLE SHEETS                                  ║
// ╚══════════════════════════════════════════════════════╝
async function apiCall(action, payload = {}) {
  if (!CONFIG.sheetURL) return null;
  try {
    const res = await fetch(CONFIG.sheetURL, {
      method : "POST",
      headers: { "Content-Type": "text/plain" },
      body   : JSON.stringify({ action, ...payload }),
    });
    return await res.json();
  } catch (e) {
    console.error("API error:", e);
    return null;
  }
}

async function cargarDatos() {
  mostrarCargando(true);
  const res = await apiCall("getAll");
  if (res && res.ok) {
    appointments   = res.citas        || [];
    diasBloqueados = new Set(res.bloqueados || []);
  }
  mostrarCargando(false);
  renderCalendar();
  setNextSlot();
  if (isLoggedIn) { renderAppointments(); renderDiasBloqueados(); renderMiniCal(); }
}

async function guardarCita(cita) {
  return await apiCall("addCita", { cita });
}

async function eliminarCita(id) {
  return await apiCall("deleteCita", { id });
}

async function toggleBloqueo(dateKey) {
  const bloqueado = diasBloqueados.has(dateKey);
  const res = await apiCall("toggleBloqueo", { dateKey, bloqueado });
  if (res && res.ok) {
    if (bloqueado) diasBloqueados.delete(dateKey);
    else           diasBloqueados.add(dateKey);
  }
  return res;
}

// ╔══════════════════════════════════════════════════════╗
// ║  UTILIDADES DE FECHA / SLOTS                        ║
// ╚══════════════════════════════════════════════════════╝
function getDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function parseDateKey(k) {
  const [y,m,d] = k.split("-");
  return new Date(+y, +m-1, +d);
}
function formatDate(k) {
  return parseDateKey(k).toLocaleDateString("es-MX", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}

function getSlotsForDay(dow) {
  const h = CONFIG.horarios[dow];
  if (!h) return [];
  const slots = [];
  let hr = h[0], mn = 0;
  while (hr < h[1]) {
    slots.push(`${String(hr).padStart(2,"0")}:${String(mn).padStart(2,"0")}`);
    mn += CONFIG.duracionMin;
    if (mn >= 60) { hr += Math.floor(mn/60); mn %= 60; }
  }
  return slots;
}

function getSlotsForDate(key) {
  const all   = getSlotsForDay(parseDateKey(key).getDay());
  const taken = appointments.filter(a => a.fecha === key).map(a => a.hora);
  return all.map(t => ({ time: t, taken: taken.includes(t) }));
}

function getDayStatus(date) {
  const key = getDateKey(date);
  if (diasBloqueados.has(key)) return "closed";
  const all = getSlotsForDay(date.getDay());
  if (!all.length) return "closed";
  const taken = appointments.filter(a => a.fecha === key).length;
  if (taken === 0)            return "available";
  if (taken < all.length * .7) return "available";
  if (taken < all.length)     return "partial";
  return "full";
}

// ╔══════════════════════════════════════════════════════╗
// ║  UI HELPERS                                         ║
// ╚══════════════════════════════════════════════════════╝
function toast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg; el.className = `toast ${type}`;
  setTimeout(() => { el.className = "toast hidden"; }, 3500);
}

function mostrarCargando(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

function setNextSlot() {
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i);
    const key = getDateKey(d);
    if (diasBloqueados.has(key)) continue;
    const all = getSlotsForDay(d.getDay());
    if (!all.length) continue;
    const taken = appointments.filter(a => a.fecha === key).map(a => a.hora);
    const free = all.filter(s => !taken.includes(s));
    if (free.length) {
      document.getElementById("nextSlotHero").textContent =
        i === 0 ? `Hoy · ${free[0]}`
        : `${d.toLocaleDateString("es-MX",{weekday:"short",month:"short",day:"numeric"})} · ${free[0]}`;
      return;
    }
  }
  document.getElementById("nextSlotHero").textContent = "Sin disponibilidad próxima";
}

// ╔══════════════════════════════════════════════════════╗
// ║  CALENDARIO PÚBLICO                                 ║
// ╚══════════════════════════════════════════════════════╝
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function renderCalendar() {
  const grid = document.getElementById("calGrid");
  const label = document.getElementById("calMonthLabel");
  grid.innerHTML = "";
  const y = viewDate.getFullYear(), mo = viewDate.getMonth();
  const today = new Date(); today.setHours(0,0,0,0);
  label.textContent = `${MESES[mo]} ${y}`;

  const first = new Date(y, mo, 1).getDay();
  const days  = new Date(y, mo+1, 0).getDate();

  for (let i = 0; i < first; i++) {
    const el = document.createElement("div"); el.className = "cal-day empty"; grid.appendChild(el);
  }
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, mo, d);
    const key  = getDateKey(date);
    const el   = document.createElement("div");
    el.textContent = d; el.className = "cal-day";
    if (date < today) {
      el.classList.add("past");
    } else {
      const st = getDayStatus(date);
      if (st === "closed") el.classList.add("closed");
      else {
        el.classList.add(st === "full" ? "full" : st === "partial" ? "partial" : "available");
        el.addEventListener("click", () => selectDay(date, key));
      }
    }
    if (date.toDateString() === today.toDateString()) el.classList.add("today");
    if (selectedDate && key === selectedDate) el.classList.add("selected");
    grid.appendChild(el);
  }
}

function selectDay(date, key) {
  selectedDate = key;
  renderCalendar();
  renderSlots(date, key);
  document.getElementById("fecha").value = key;
}

function renderSlots(date, key) {
  const wrap  = document.getElementById("slotsWrap");
  const title = document.getElementById("slotsTitle");
  const grid  = document.getElementById("slotsGrid");
  const sel   = document.getElementById("hora");

  title.textContent = date.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"});
  grid.innerHTML = ""; sel.innerHTML = '<option value="">— Selecciona hora —</option>';

  if (diasBloqueados.has(key)) {
    grid.innerHTML = '<p style="color:var(--red);font-size:14px;font-weight:500;">⛔ Este día no está disponible.</p>';
    wrap.style.display = "block"; return;
  }
  const slots = getSlotsForDate(key);
  if (!slots.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:14px;">No hay horario este día.</p>';
    wrap.style.display = "block"; return;
  }
  slots.forEach(({ time, taken }) => {
    const btn = document.createElement("button");
    btn.type = "button"; btn.textContent = time;
    btn.className = `slot-btn ${taken ? "taken" : ""}`;
    if (!taken) {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".slot-btn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        sel.value = time;
        document.getElementById("agendar").scrollIntoView({behavior:"smooth",block:"start"});
      });
    }
    grid.appendChild(btn);
    if (!taken) {
      const opt = document.createElement("option"); opt.value = time; opt.textContent = time;
      sel.appendChild(opt);
    }
  });
  wrap.style.display = "block";
}

// ╔══════════════════════════════════════════════════════╗
// ║  SERVICIOS DINÁMICOS                                ║
// ╚══════════════════════════════════════════════════════╝
document.getElementById("categoria").addEventListener("change", function () {
  const s = document.getElementById("servicio");
  s.innerHTML = '<option value="">— Elige un servicio —</option>';
  (SERVICIOS[this.value] || []).forEach(v => {
    const o = document.createElement("option"); o.value = v; o.textContent = v; s.appendChild(o);
  });
});

// ╔══════════════════════════════════════════════════════╗
// ║  FORMULARIO DE CITA                                 ║
// ╚══════════════════════════════════════════════════════╝
function buildWAMessage(a) {
  return encodeURIComponent(
    `¡Hola ${CONFIG.nombreFisio}! — *${CONFIG.negocio}* 👋\n\n` +
    `Nueva solicitud de cita:\n\n` +
    `👤 *Nombre:* ${a.nombre}\n` +
    `📱 *WhatsApp:* ${a.tel}\n` +
    `📅 *Fecha:* ${formatDate(a.fecha)}\n` +
    `🕐 *Hora:* ${a.hora}\n` +
    `🗂️ *Categoría:* ${a.categoria === "fisio" ? "Fisioterapia" : "Laminado & Rizado"}\n` +
    `🩺 *Servicio:* ${a.servicio}\n` +
    (a.motivo ? `📝 *Comentarios:* ${a.motivo}\n` : "") +
    `\n¿Confirmas la cita? ¡Gracias!`
  );
}

document.getElementById("apptForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const nombre    = document.getElementById("nombre").value.trim();
  const tel       = document.getElementById("tel").value.trim();
  const categoria = document.getElementById("categoria").value;
  const servicio  = document.getElementById("servicio").value;
  const fecha     = document.getElementById("fecha").value;
  const hora      = document.getElementById("hora").value;
  const motivo    = document.getElementById("motivo").value.trim();

  if (!nombre || !tel || !categoria || !servicio || !fecha || !hora) {
    toast("Completa todos los campos obligatorios.", "error"); return;
  }
  if (diasBloqueados.has(fecha)) {
    toast("Ese día no está disponible. Elige otra fecha.", "error"); return;
  }

  const btn = document.getElementById("submitBtn");
  btn.disabled = true; btn.textContent = "Guardando…";

  const cita = { id: Date.now(), nombre, tel, categoria, servicio, fecha, hora, motivo, creada: new Date().toISOString() };
  const res  = await guardarCita(cita);

  if (res && res.ok) {
    appointments.push(cita);
    window.open(`https://wa.me/${CONFIG.whatsapp}?text=${buildWAMessage(cita)}`, "_blank");
    toast("¡Cita registrada! WhatsApp abierto ✓", "success");
    this.reset();
    document.getElementById("servicio").innerHTML = '<option value="">— Primero elige categoría —</option>';
    renderCalendar(); setNextSlot();
    if (isLoggedIn) renderAppointments();
  } else {
    // Sin sheetURL → modo demo (solo local)
    appointments.push(cita);
    window.open(`https://wa.me/${CONFIG.whatsapp}?text=${buildWAMessage(cita)}`, "_blank");
    toast("¡Cita registrada localmente! Configura Google Sheets para sincronizar.", "");
    this.reset();
    document.getElementById("servicio").innerHTML = '<option value="">— Primero elige categoría —</option>';
    renderCalendar(); setNextSlot();
  }

  btn.disabled = false; btn.textContent = "Confirmar cita vía WhatsApp →";
});

// ╔══════════════════════════════════════════════════════╗
// ║  PANEL DIANA — PIN                                  ║
// ╚══════════════════════════════════════════════════════╝
document.getElementById("pinBtn").addEventListener("click", checkPin);
document.getElementById("pinInput").addEventListener("keydown", e => { if (e.key === "Enter") checkPin(); });

function checkPin() {
  if (document.getElementById("pinInput").value === CONFIG.pin) {
    isLoggedIn = true;
    document.getElementById("loginPanel").classList.add("hidden");
    document.getElementById("citasPanel").classList.remove("hidden");
    renderAppointments(); renderDiasBloqueados(); renderMiniCal();
  } else {
    document.getElementById("pinError").classList.remove("hidden");
    document.getElementById("pinInput").value = "";
    document.getElementById("pinInput").focus();
  }
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  isLoggedIn = false;
  document.getElementById("citasPanel").classList.add("hidden");
  document.getElementById("loginPanel").classList.remove("hidden");
  document.getElementById("pinInput").value = "";
  document.getElementById("pinError").classList.add("hidden");
});

// ╔══════════════════════════════════════════════════════╗
// ║  BLOQUEO DE DÍAS                                    ║
// ╚══════════════════════════════════════════════════════╝
async function handleToggleBloqueo(key) {
  const btn = document.querySelector(`[data-bloq="${key}"]`);
  if (btn) { btn.disabled = true; btn.textContent = "…"; }

  const estabaBloqueado = diasBloqueados.has(key);
  const res = await toggleBloqueo(key);

  if (res && res.ok) {
    toast(estabaBloqueado ? `${formatDate(key)} reactivado ✓` : `${formatDate(key)} bloqueado ⛔`, estabaBloqueado ? "success" : "");
  } else if (!CONFIG.sheetURL) {
    // modo demo
    if (estabaBloqueado) diasBloqueados.delete(key); else diasBloqueados.add(key);
    toast("Cambio guardado localmente (modo demo).", "");
  }
  renderCalendar(); setNextSlot(); renderDiasBloqueados(); renderMiniCal();
}

function renderDiasBloqueados() {
  const wrap = document.getElementById("diasBloqueadosWrap");
  if (!wrap) return;
  const hoy = getDateKey(new Date());
  const lista = [...diasBloqueados].filter(k => k >= hoy).sort();
  if (!lista.length) {
    wrap.innerHTML = '<p class="empty-state" style="font-size:13px;">Ningún día bloqueado próximamente.</p>'; return;
  }
  wrap.innerHTML = lista.map(k => `
    <div class="dia-bloq-item">
      <span>${formatDate(k)}</span>
      <button class="btn-reactivar" data-bloq="${k}" onclick="handleToggleBloqueo('${k}')">Reactivar</button>
    </div>`).join("");
}

function renderMiniCal() {
  const grid = document.getElementById("miniCalGrid");
  const label = document.getElementById("miniCalLabel");
  if (!grid) return;
  grid.innerHTML = "";
  const y = viewDate.getFullYear(), mo = viewDate.getMonth();
  const today = new Date(); today.setHours(0,0,0,0);
  label.textContent = `${MESES[mo]} ${y}`;
  const first = new Date(y, mo, 1).getDay();
  const days  = new Date(y, mo+1, 0).getDate();
  for (let i = 0; i < first; i++) {
    const el = document.createElement("div"); el.className = "mini-cal-day empty"; grid.appendChild(el);
  }
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, mo, d);
    const key  = getDateKey(date);
    const el   = document.createElement("div");
    el.textContent = d; el.className = "mini-cal-day";
    const noLabora = !getSlotsForDay(date.getDay()).length;
    if (date < today || noLabora) {
      el.classList.add("mini-past");
    } else {
      if (diasBloqueados.has(key)) el.classList.add("mini-bloq");
      el.title = diasBloqueados.has(key) ? "Clic para reactivar" : "Clic para bloquear";
      el.addEventListener("click", () => handleToggleBloqueo(key));
    }
    grid.appendChild(el);
  }
}

document.addEventListener("click", e => {
  if (e.target.id === "miniPrevMonth") { viewDate.setMonth(viewDate.getMonth()-1); renderCalendar(); renderMiniCal(); }
  if (e.target.id === "miniNextMonth") { viewDate.setMonth(viewDate.getMonth()+1); renderCalendar(); renderMiniCal(); }
});

// ╔══════════════════════════════════════════════════════╗
// ║  LISTA DE CITAS                                     ║
// ╚══════════════════════════════════════════════════════╝
function renderAppointments() {
  if (!isLoggedIn) return;
  const list = document.getElementById("appointmentsList");
  if (!appointments.length) { list.innerHTML = '<p class="empty-state">Aún no hay citas agendadas.</p>'; return; }
  const sorted = [...appointments].sort((a,b) => (a.fecha+a.hora).localeCompare(b.fecha+b.hora));
  const hoy = getDateKey(new Date());
  const up   = sorted.filter(a => a.fecha >= hoy);
  const past = sorted.filter(a => a.fecha < hoy);
  let html = "";
  if (up.length)   { html += `<p class="appt-section-label">Próximas citas (${up.length})</p>`; html += up.map(apptCard).join(""); }
  if (past.length) { html += `<p class="appt-section-label muted">Citas anteriores (${past.length})</p>`; html += past.map(a => apptCard(a, true)).join(""); }
  list.innerHTML = html;
}

function apptCard(a, isPast = false) {
  const cat = a.categoria === "fisio" ? "Fisioterapia" : "Laminado & Rizado";
  const cls = a.categoria === "estetica" ? "beauty" : "";
  return `
    <div class="appt-item ${isPast ? "past-item" : ""}">
      <div class="appt-info">
        <p class="appt-name">${a.nombre} <span class="appt-cat ${cls}">${cat}</span></p>
        <p class="appt-meta">${formatDate(a.fecha)} · ${a.hora}</p>
        <p class="appt-meta">🩺 ${a.servicio}</p>
        ${a.motivo ? `<p class="appt-meta appt-note">💬 ${a.motivo}</p>` : ""}
        <p class="appt-meta">📱 <a href="https://wa.me/${a.tel.replace(/\D/g,"")}" target="_blank" style="color:var(--sage)">${a.tel}</a></p>
      </div>
      <div class="appt-actions">
        <a href="https://wa.me/${CONFIG.whatsapp}?text=${buildWAMessage(a)}" target="_blank" class="btn-wa-small">
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.106.548 4.083 1.508 5.797L0 24l6.334-1.482A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.854 0-3.6-.498-5.112-1.369l-.366-.218-3.762.88.924-3.672-.24-.378A9.935 9.935 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>WA
        </a>
        <button class="btn-delete" onclick="borrarCita(${a.id})">Eliminar</button>
      </div>
    </div>`;
}

async function borrarCita(id) {
  if (!confirm("¿Eliminar esta cita?")) return;
  const res = await eliminarCita(id);
  if (res && res.ok || !CONFIG.sheetURL) {
    appointments = appointments.filter(a => a.id !== id);
    renderAppointments(); renderCalendar(); setNextSlot();
    toast("Cita eliminada.");
  }
}

// ╔══════════════════════════════════════════════════════╗
// ║  NAV / FECHA MÍNIMA / INIT                          ║
// ╚══════════════════════════════════════════════════════╝
document.getElementById("hamburger").addEventListener("click", () => {
  document.querySelector(".nav-links").classList.toggle("open");
});

(function setMinDate() {
  const hoy = getDateKey(new Date());
  document.getElementById("fecha").min = hoy;
  document.getElementById("fecha").addEventListener("change", function () {
    const [y,m,d] = this.value.split("-");
    selectDay(new Date(+y,+m-1,+d), this.value);
  });
})();

document.getElementById("prevMonth").addEventListener("click", () => { viewDate.setMonth(viewDate.getMonth()-1); renderCalendar(); });
document.getElementById("nextMonth").addEventListener("click", () => { viewDate.setMonth(viewDate.getMonth()+1); renderCalendar(); });

// Refresco automático cada 2 minutos para mantener datos actualizados
setInterval(() => { if (CONFIG.sheetURL) cargarDatos(); }, 120000);

cargarDatos();
