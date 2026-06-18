// ╔══════════════════════════════════════════════════════╗
// ║  CONFIGURACIÓN                                      ║
// ╚══════════════════════════════════════════════════════╝
const CONFIG = {
  nombreFisio : "Diana Gisel",
  negocio     : "DG Bienestar y Belleza",
  whatsapp    : "523312345678",  // ← número real de Diana (52 + 10 dígitos sin espacios)
  duracionMin : 60,
  pin         :"0922",
  // Pega aquí la URL del Web App de Google Apps Script:
  sheetURL    :"https://script.google.com/macros/s/AKfycbyDWNlJ9JukghKlBc4xlUiSHNcDvuoVygEBNkDSElQXDFBcOp-rjEJqPc7yEpFayLwudQ/exec",
  horarios: {
    0: [9,  20],   // Domingo   9am–8pm
    1: [16, 20],   // Lunes     4pm–8pm
    2: [16, 20],   // Martes    4pm–8pm
    3: [16, 20],   // Miércoles 4pm–8pm
    4: [16, 20],   // Jueves    4pm–8pm
    5: [16, 20],   // Viernes   4pm–8pm
    6: [9,  20],   // Sábado    9am–8pm
  },
};

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
let appointments   = [];
let diasBloqueados = new Set();
let viewDate       = new Date();
let selectedDate   = null;
let isLoggedIn     = false;

// ╔══════════════════════════════════════════════════════╗
// ║  API GOOGLE SHEETS                                  ║
// ╚══════════════════════════════════════════════════════╝
async function apiCall(params) {
  if (!CONFIG.sheetURL) return null;
  try {
    const url = CONFIG.sheetURL + "?" + new URLSearchParams(params).toString();
    const res = await fetch(url, { method: "GET" });
    const text = await res.text();
    return JSON.parse(text);
  } catch (err) {
    console.warn("API error:", err);
    return null;
  }
}

async function cargarDatos() {
  mostrarCargando(true);
  try {
    const res = await apiCall({ action: "getAll" });
    if (res && res.ok) {
      appointments   = Array.isArray(res.citas) ? res.citas.map(c => ({ ...c, id: Number(c.id) || c.id })) : [];
      diasBloqueados = new Set(Array.isArray(res.bloqueados) ? res.bloqueados : []);
    }
  } catch (err) {
    console.warn("cargarDatos error:", err);
  }
  mostrarCargando(false);
  renderCalendar();
  setNextSlot();
  if (isLoggedIn) {
    renderAppointments();
    renderDiasBloqueados();
    renderMiniCal();
  }
}

async function guardarCita(cita) {
  try {
    return await apiCall({ action: "addCita", cita: JSON.stringify(cita) });
  } catch (e) { return null; }
}

async function eliminarCitaAPI(id) {
  try {
    return await apiCall({ action: "deleteCita", id: String(id) });
  } catch (e) { return null; }
}

async function toggleBloqueoAPI(dateKey, estabaBloqueado) {
  try {
    return await apiCall({ action: "toggleBloqueo", dateKey, bloqueado: String(estabaBloqueado) });
  } catch (e) { return null; }
}

// ╔══════════════════════════════════════════════════════╗
// ║  UTILIDADES                                         ║
// ╚══════════════════════════════════════════════════════╝
function getDateKey(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function parseDateKey(k) {
  const p = k.split("-");
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

function formatDate(k) {
  try {
    return parseDateKey(k).toLocaleDateString("es-MX", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
  } catch (e) { return k; }
}

function getSlotsForDay(dow) {
  const h = CONFIG.horarios[dow];
  if (!h) return [];
  const slots = [];
  let hr = h[0], mn = 0;
  while (hr < h[1]) {
    slots.push(String(hr).padStart(2, "0") + ":" + String(mn).padStart(2, "0"));
    mn += CONFIG.duracionMin;
    if (mn >= 60) { hr += Math.floor(mn / 60); mn %= 60; }
  }
  return slots;
}

function getSlotsForDate(key) {
  const all   = getSlotsForDay(parseDateKey(key).getDay());
  const taken = appointments.filter(a => String(a.fecha) === key).map(a => String(a.hora));
  return all.map(t => ({ time: t, taken: taken.includes(t) }));
}

function getDayStatus(date) {
  const key = getDateKey(date);
  if (diasBloqueados.has(key)) return "closed";
  const all = getSlotsForDay(date.getDay());
  if (!all.length) return "closed";
  const taken = appointments.filter(a => String(a.fecha) === key).length;
  if (taken === 0)             return "available";
  if (taken < all.length * .7) return "available";
  if (taken < all.length)      return "partial";
  return "full";
}

function toast(msg, type) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast" + (type ? " " + type : "");
  setTimeout(() => { el.className = "toast hidden"; }, 3500);
}

function mostrarCargando(show) {
  const el = document.getElementById("loadingOverlay");
  if (el) el.style.display = show ? "flex" : "none";
}

function setNextSlot() {
  const el = document.getElementById("nextSlotHero");
  if (!el) return;
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const key = getDateKey(d);
    if (diasBloqueados.has(key)) continue;
    const all = getSlotsForDay(d.getDay());
    if (!all.length) continue;
    const taken = appointments.filter(a => String(a.fecha) === key).map(a => String(a.hora));
    const free  = all.filter(s => !taken.includes(s));
    if (free.length) {
      el.textContent = i === 0
        ? "Hoy · " + free[0]
        : d.toLocaleDateString("es-MX", { weekday: "short", month: "short", day: "numeric" }) + " · " + free[0];
      return;
    }
  }
  el.textContent = "Sin disponibilidad próxima";
}

// ╔══════════════════════════════════════════════════════╗
// ║  CALENDARIO PÚBLICO                                 ║
// ╚══════════════════════════════════════════════════════╝
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function renderCalendar() {
  const grid  = document.getElementById("calGrid");
  const label = document.getElementById("calMonthLabel");
  if (!grid || !label) return;
  grid.innerHTML = "";

  const y   = viewDate.getFullYear();
  const mo  = viewDate.getMonth();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  label.textContent = MESES[mo] + " " + y;

  const firstDay    = new Date(y, mo, 1).getDay();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement("div");
    el.className = "cal-day empty";
    grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, mo, d);
    const key  = getDateKey(date);
    const el   = document.createElement("div");
    el.textContent = d;
    el.className = "cal-day";

    if (date < today) {
      el.classList.add("past");
    } else {
      const st = getDayStatus(date);
      if (st === "closed") {
        el.classList.add("closed");
      } else {
        el.classList.add(st === "full" ? "full" : st === "partial" ? "partial" : "available");
        el.addEventListener("click", function() { selectDay(date, key); });
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
  const fechaInput = document.getElementById("fecha");
  if (fechaInput) fechaInput.value = key;
}

function renderSlots(date, key) {
  const wrap  = document.getElementById("slotsWrap");
  const title = document.getElementById("slotsTitle");
  const grid  = document.getElementById("slotsGrid");
  const sel   = document.getElementById("hora");
  if (!wrap || !title || !grid || !sel) return;

  title.textContent = date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  grid.innerHTML = "";
  sel.innerHTML  = '<option value="">— Selecciona hora —</option>';

  if (diasBloqueados.has(key)) {
    grid.innerHTML = '<p style="color:var(--red);font-size:14px;font-weight:500;">⛔ Este día no está disponible.</p>';
    wrap.style.display = "block";
    return;
  }

  const slots = getSlotsForDate(key);
  if (!slots.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:14px;">No hay horario disponible este día.</p>';
    wrap.style.display = "block";
    return;
  }

  slots.forEach(function(s) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = s.time;
    btn.className = "slot-btn" + (s.taken ? " taken" : "");
    if (!s.taken) {
      btn.addEventListener("click", function() {
        document.querySelectorAll(".slot-btn").forEach(function(b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
        sel.value = s.time;
        document.getElementById("agendar").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      const opt = document.createElement("option");
      opt.value = s.time; opt.textContent = s.time;
      sel.appendChild(opt);
    }
    grid.appendChild(btn);
  });

  wrap.style.display = "block";
}

// ╔══════════════════════════════════════════════════════╗
// ║  SERVICIOS DINÁMICOS                                ║
// ╚══════════════════════════════════════════════════════╝
document.getElementById("categoria").addEventListener("change", function() {
  const s = document.getElementById("servicio");
  s.innerHTML = '<option value="">— Elige un servicio —</option>';
  const lista = SERVICIOS[this.value] || [];
  lista.forEach(function(v) {
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    s.appendChild(o);
  });
});

// ╔══════════════════════════════════════════════════════╗
// ║  FORMULARIO AGENDAR                                 ║
// ╚══════════════════════════════════════════════════════╝
function buildWAMessage(a) {
  return encodeURIComponent(
    "¡Hola " + CONFIG.nombreFisio + "! — *" + CONFIG.negocio + "* 👋\n\n" +
    "Nueva solicitud de cita:\n\n" +
    "👤 *Nombre:* " + a.nombre + "\n" +
    "📱 *WhatsApp:* " + a.tel + "\n" +
    "📅 *Fecha:* " + formatDate(a.fecha) + "\n" +
    "🕐 *Hora:* " + a.hora + "\n" +
    "🗂️ *Categoría:* " + (a.categoria === "fisio" ? "Fisioterapia" : "Laminado & Rizado") + "\n" +
    "🩺 *Servicio:* " + a.servicio + "\n" +
    (a.motivo ? "📝 *Comentarios:* " + a.motivo + "\n" : "") +
    "\n¿Confirmas la cita? ¡Gracias!"
  );
}

document.getElementById("apptForm").addEventListener("submit", async function(e) {
  e.preventDefault();

  const nombre    = document.getElementById("nombre").value.trim();
  const tel       = document.getElementById("tel").value.trim();
  const categoria = document.getElementById("categoria").value;
  const servicio  = document.getElementById("servicio").value;
  const fecha     = document.getElementById("fecha").value;
  const hora      = document.getElementById("hora").value;
  const motivo    = document.getElementById("motivo").value.trim();

  if (!nombre || !tel || !categoria || !servicio || !fecha || !hora) {
    toast("Completa todos los campos obligatorios.", "error");
    return;
  }
  if (diasBloqueados.has(fecha)) {
    toast("Ese día no está disponible. Elige otra fecha.", "error");
    return;
  }

  const btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = "Guardando…";

  const cita = {
    id      : Date.now(),
    nombre  : nombre,
    tel     : tel,
    categoria: categoria,
    servicio: servicio,
    fecha   : fecha,
    hora    : hora,
    motivo  : motivo,
    creada  : new Date().toISOString()
  };

  if (CONFIG.sheetURL) {
    const res = await guardarCita(cita);
    if (res && res.ok) {
      toast("¡Cita guardada! Se verá en todos los dispositivos ✓", "success");
    } else {
      toast("Revisa tu conexión. La cita se guardó localmente.", "");
    }
  } else {
    toast("Cita registrada. (Configura sheetURL para sincronizar)", "");
  }

  appointments.push(cita);
  window.open("https://wa.me/" + CONFIG.whatsapp + "?text=" + buildWAMessage(cita), "_blank");

  this.reset();
  document.getElementById("servicio").innerHTML = '<option value="">— Primero elige categoría —</option>';
  renderCalendar();
  setNextSlot();
  if (isLoggedIn) renderAppointments();

  btn.disabled = false;
  btn.textContent = "Confirmar cita vía WhatsApp →";
});

// ╔══════════════════════════════════════════════════════╗
// ║  PANEL DIANA — PIN                                  ║
// ╚══════════════════════════════════════════════════════╝
function checkPin() {
  const input = document.getElementById("pinInput");
  const error = document.getElementById("pinError");
  if (!input) return;

  if (input.value === CONFIG.pin) {
    isLoggedIn = true;
    document.getElementById("loginPanel").classList.add("hidden");
    document.getElementById("citasPanel").classList.remove("hidden");
    renderAppointments();
    renderDiasBloqueados();
    renderMiniCal();
  } else {
    if (error) error.classList.remove("hidden");
    input.value = "";
    input.focus();
  }
}

document.getElementById("pinBtn").addEventListener("click", checkPin);
document.getElementById("pinInput").addEventListener("keydown", function(e) {
  if (e.key === "Enter") checkPin();
});
document.getElementById("logoutBtn").addEventListener("click", function() {
  isLoggedIn = false;
  document.getElementById("citasPanel").classList.add("hidden");
  document.getElementById("loginPanel").classList.remove("hidden");
  document.getElementById("pinInput").value = "";
  const err = document.getElementById("pinError");
  if (err) err.classList.add("hidden");
});

// ╔══════════════════════════════════════════════════════╗
// ║  BLOQUEO DE DÍAS                                    ║
// ╚══════════════════════════════════════════════════════╝
async function handleToggleBloqueo(key) {
  const estaba = diasBloqueados.has(key);
  if (estaba) diasBloqueados.delete(key);
  else        diasBloqueados.add(key);

  renderCalendar();
  setNextSlot();
  renderDiasBloqueados();
  renderMiniCal();
  toast(estaba ? formatDate(key) + " reactivado ✓" : formatDate(key) + " bloqueado ⛔", estaba ? "success" : "");

  if (CONFIG.sheetURL) await toggleBloqueoAPI(key, estaba);
}

function renderDiasBloqueados() {
  const wrap = document.getElementById("diasBloqueadosWrap");
  if (!wrap) return;
  const hoy   = getDateKey(new Date());
  const lista = Array.from(diasBloqueados).filter(function(k) { return k >= hoy; }).sort();
  if (!lista.length) {
    wrap.innerHTML = '<p class="empty-state" style="font-size:13px;">Ningún día bloqueado próximamente.</p>';
    return;
  }
  wrap.innerHTML = lista.map(function(k) {
    return '<div class="dia-bloq-item"><span>' + formatDate(k) + '</span>' +
      '<button class="btn-reactivar" onclick="handleToggleBloqueo(\'' + k + '\')">Reactivar</button></div>';
  }).join("");
}

function renderMiniCal() {
  const grid  = document.getElementById("miniCalGrid");
  const label = document.getElementById("miniCalLabel");
  if (!grid || !label) return;
  grid.innerHTML = "";

  const y   = viewDate.getFullYear();
  const mo  = viewDate.getMonth();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  label.textContent = MESES[mo] + " " + y;

  const firstDay    = new Date(y, mo, 1).getDay();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement("div");
    el.className = "mini-cal-day empty";
    grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, mo, d);
    const key  = getDateKey(date);
    const el   = document.createElement("div");
    el.textContent = d;
    el.className = "mini-cal-day";
    const noLabora = getSlotsForDay(date.getDay()).length === 0;
    if (date < today || noLabora) {
      el.classList.add("mini-past");
    } else {
      if (diasBloqueados.has(key)) el.classList.add("mini-bloq");
      el.title = diasBloqueados.has(key) ? "Clic para reactivar" : "Clic para bloquear";
      el.addEventListener("click", function() { handleToggleBloqueo(key); });
    }
    grid.appendChild(el);
  }
}

// Navegación mini-cal
document.getElementById("miniPrevMonth").addEventListener("click", function() {
  viewDate.setMonth(viewDate.getMonth() - 1);
  renderCalendar();
  renderMiniCal();
});
document.getElementById("miniNextMonth").addEventListener("click", function() {
  viewDate.setMonth(viewDate.getMonth() + 1);
  renderCalendar();
  renderMiniCal();
});

// ╔══════════════════════════════════════════════════════╗
// ║  LISTA DE CITAS (panel Diana)                       ║
// ╚══════════════════════════════════════════════════════╝
function renderAppointments() {
  if (!isLoggedIn) return;
  const list = document.getElementById("appointmentsList");
  if (!list) return;

  if (!appointments.length) {
    list.innerHTML = '<p class="empty-state">Aún no hay citas agendadas.</p>';
    return;
  }

  const sorted = appointments.slice().sort(function(a, b) {
    return (String(a.fecha) + String(a.hora)).localeCompare(String(b.fecha) + String(b.hora));
  });

  const hoy = getDateKey(new Date());
  const up   = sorted.filter(function(a) { return String(a.fecha) >= hoy; });
  const past = sorted.filter(function(a) { return String(a.fecha) < hoy; });

  let html = "";
  if (up.length)   { html += '<p class="appt-section-label">Próximas citas (' + up.length + ')</p>'; html += up.map(apptCard).join(""); }
  if (past.length) { html += '<p class="appt-section-label muted">Anteriores (' + past.length + ')</p>'; html += past.map(function(a) { return apptCard(a, true); }).join(""); }
  list.innerHTML = html;
}

function apptCard(a, isPast) {
  const cat = a.categoria === "fisio" ? "Fisioterapia" : "Laminado & Rizado";
  const cls = a.categoria === "estetica" ? "beauty" : "";
  const tel = String(a.tel || "").replace(/\D/g, "");
  return '<div class="appt-item' + (isPast ? ' past-item' : '') + '">' +
    '<div class="appt-info">' +
      '<p class="appt-name">' + a.nombre + ' <span class="appt-cat ' + cls + '">' + cat + '</span></p>' +
      '<p class="appt-meta">' + formatDate(String(a.fecha)) + ' · ' + a.hora + '</p>' +
      '<p class="appt-meta">🩺 ' + a.servicio + '</p>' +
      (a.motivo ? '<p class="appt-meta appt-note">💬 ' + a.motivo + '</p>' : '') +
      '<p class="appt-meta">📱 <a href="https://wa.me/' + tel + '" target="_blank" style="color:var(--sage)">' + a.tel + '</a></p>' +
    '</div>' +
    '<div class="appt-actions">' +
      '<a href="https://wa.me/' + CONFIG.whatsapp + '?text=' + buildWAMessage(a) + '" target="_blank" class="btn-wa-small">' +
        '<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.106.548 4.083 1.508 5.797L0 24l6.334-1.482A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.854 0-3.6-.498-5.112-1.369l-.366-.218-3.762.88.924-3.672-.24-.378A9.935 9.935 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>WA' +
      '</a>' +
      '<button class="btn-delete" onclick="borrarCita(' + a.id + ')">Eliminar</button>' +
    '</div>' +
  '</div>';
}

async function borrarCita(id) {
  if (!confirm("¿Eliminar esta cita?")) return;
  if (CONFIG.sheetURL) await eliminarCitaAPI(id);
  appointments = appointments.filter(function(a) { return a.id !== id; });
  renderAppointments();
  renderCalendar();
  setNextSlot();
  toast("Cita eliminada.");
}

// ╔══════════════════════════════════════════════════════╗
// ║  NAV, FECHAS, INICIO                               ║
// ╚══════════════════════════════════════════════════════╝
document.getElementById("hamburger").addEventListener("click", function() {
  document.querySelector(".nav-links").classList.toggle("open");
});

// Fecha mínima = hoy
var hoyStr = getDateKey(new Date());
var fechaInput = document.getElementById("fecha");
fechaInput.min = hoyStr;
fechaInput.addEventListener("change", function() {
  var parts = this.value.split("-");
  if (parts.length === 3) {
    selectDay(new Date(+parts[0], +parts[1] - 1, +parts[2]), this.value);
  }
});

// Navegación calendario público
document.getElementById("prevMonth").addEventListener("click", function() {
  viewDate.setMonth(viewDate.getMonth() - 1);
  renderCalendar();
});
document.getElementById("nextMonth").addEventListener("click", function() {
  viewDate.setMonth(viewDate.getMonth() + 1);
  renderCalendar();
});

// Refresco automático cada 90 segundos
setInterval(function() {
  if (CONFIG.sheetURL) cargarDatos();
}, 90000);

// INICIO — renderiza calendario inmediatamente, luego carga datos de Sheets
renderCalendar();
setNextSlot();
cargarDatos();
