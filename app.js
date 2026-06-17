// ===== CONFIGURACIÓN — EDITA AQUÍ =====
const CONFIG = {
  nombreFisio: "Diana Gisel",
  negocio: "DG Bienestar y Belleza",
  whatsapp: "523312345678",          // Número de Diana: código país + número sin + ni espacios
  duracionMin: 60,                   // 1 hora por cita

  // Horario según día de la semana
  // Cada entrada: [horaInicio, horaFin]
  horarios: {
    0: [9, 20],   // Domingo  9am–8pm
    1: [16, 20],  // Lunes    4pm–8pm
    2: [16, 20],  // Martes   4pm–8pm
    3: [16, 20],  // Miércoles
    4: [16, 20],  // Jueves
    5: [16, 20],  // Viernes  4pm–8pm
    6: [9, 20],   // Sábado   9am–8pm
  },

  // PIN de acceso al panel de Diana (cámbialo antes de publicar)
  pin: "0922",
};

// Servicios por categoría
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

// ===== ESTADO =====
let viewDate = new Date();
let selectedDate = null;
let appointments = loadAppointments();
let isLoggedIn = false;

// ===== UTILIDADES =====
function loadAppointments() {
  try { return JSON.parse(localStorage.getItem("dianagisio_citas") || "[]"); }
  catch { return []; }
}

function saveAppointments() {
  localStorage.setItem("dianagisio_citas", JSON.stringify(appointments));
}

function getSlotsForDay(dayOfWeek) {
  const h = CONFIG.horarios[dayOfWeek];
  if (!h) return [];
  const slots = [];
  let hour = h[0], min = 0;
  while (hour < h[1]) {
    slots.push(`${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`);
    min += CONFIG.duracionMin;
    if (min >= 60) { hour += Math.floor(min / 60); min = min % 60; }
  }
  return slots;
}

function getDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseDateKey(key) {
  const [y, mo, d] = key.split("-");
  return new Date(+y, +mo - 1, +d);
}

function getSlotsForDate(dateKey) {
  const date = parseDateKey(dateKey);
  const allSlots = getSlotsForDay(date.getDay());
  const taken = appointments.filter(a => a.fecha === dateKey).map(a => a.hora);
  return allSlots.map(s => ({ time: s, taken: taken.includes(s) }));
}

function getDayStatus(date) {
  const slots = getSlotsForDay(date.getDay());
  if (!slots.length) return "closed";
  const key = getDateKey(date);
  const taken = appointments.filter(a => a.fecha === key).length;
  const total = slots.length;
  if (taken === 0) return "available";
  if (taken < total * 0.7) return "available";
  if (taken < total) return "partial";
  return "full";
}

function toast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  setTimeout(() => { el.className = "toast hidden"; }, 3500);
}

function formatDate(dateKey) {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// ===== PRÓXIMO SLOT HÉROE =====
function setNextSlot() {
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const slots = getSlotsForDay(d.getDay());
    if (!slots.length) continue;
    const key = getDateKey(d);
    const taken = appointments.filter(a => a.fecha === key).map(a => a.hora);
    const free = slots.filter(s => !taken.includes(s));
    if (free.length) {
      const isToday = i === 0;
      const label = isToday
        ? `Hoy · ${free[0]}`
        : `${d.toLocaleDateString("es-MX", { weekday: "short", month: "short", day: "numeric" })} · ${free[0]}`;
      document.getElementById("nextSlotHero").textContent = label;
      return;
    }
  }
  document.getElementById("nextSlotHero").textContent = "Sin disponibilidad";
}

// ===== CALENDARIO =====
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function renderCalendar() {
  const grid = document.getElementById("calGrid");
  const label = document.getElementById("calMonthLabel");
  grid.innerHTML = "";

  const y = viewDate.getFullYear();
  const mo = viewDate.getMonth();
  const today = new Date();
  today.setHours(0,0,0,0);

  label.textContent = `${MESES[mo]} ${y}`;

  const firstDay = new Date(y, mo, 1).getDay();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement("div");
    el.className = "cal-day empty";
    grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, mo, d);
    const key = getDateKey(date);
    const el = document.createElement("div");
    el.textContent = d;
    el.className = "cal-day";

    if (date < today) {
      el.classList.add("past");
    } else {
      const status = getDayStatus(date);
      if (status === "closed") {
        el.classList.add("closed");
      } else {
        el.classList.add(status === "full" ? "full" : status === "partial" ? "partial" : "available");
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
  const wrap = document.getElementById("slotsWrap");
  const title = document.getElementById("slotsTitle");
  const grid = document.getElementById("slotsGrid");
  const horaSelect = document.getElementById("hora");

  title.textContent = date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  grid.innerHTML = "";
  horaSelect.innerHTML = '<option value="">— Selecciona hora —</option>';

  const slots = getSlotsForDate(key);

  if (!slots.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:14px;">No hay horario disponible este día.</p>';
    return;
  }

  slots.forEach(({ time, taken }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = time;
    btn.className = `slot-btn ${taken ? "taken" : ""}`;
    if (!taken) {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".slot-btn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        horaSelect.value = time;
        document.getElementById("agendar").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    grid.appendChild(btn);

    if (!taken) {
      const opt = document.createElement("option");
      opt.value = time; opt.textContent = time;
      horaSelect.appendChild(opt);
    }
  });

  wrap.style.display = "block";
}

// ===== SERVICIOS DINÁMICOS =====
document.getElementById("categoria").addEventListener("change", function () {
  const servicioSelect = document.getElementById("servicio");
  const cat = this.value;
  servicioSelect.innerHTML = '<option value="">— Elige un servicio —</option>';

  if (cat && SERVICIOS[cat]) {
    SERVICIOS[cat].forEach(s => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      servicioSelect.appendChild(opt);
    });
  }
});

// ===== FORMULARIO =====
function buildWAMessage(data) {
  return encodeURIComponent(
    `¡Hola ${CONFIG.nombreFisio} — ${CONFIG.negocio}! 👋\n\n` +
    `Me gustaría agendar una cita:\n\n` +
    `👤 *Nombre:* ${data.nombre}\n` +
    `📱 *WhatsApp:* ${data.tel}\n` +
    `📅 *Fecha:* ${formatDate(data.fecha)}\n` +
    `🕐 *Hora:* ${data.hora}\n` +
    `🗂️ *Categoría:* ${data.categoria === "fisio" ? "Fisioterapia" : "Laminado & Rizado"}\n` +
    `🩺 *Servicio:* ${data.servicio}\n` +
    (data.motivo ? `📝 *Comentarios:* ${data.motivo}\n` : "") +
    `\n¿Hay disponibilidad? ¡Gracias!`
  );
}

document.getElementById("apptForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const nombre    = document.getElementById("nombre").value.trim();
  const tel       = document.getElementById("tel").value.trim();
  const categoria = document.getElementById("categoria").value;
  const servicio  = document.getElementById("servicio").value;
  const fecha     = document.getElementById("fecha").value;
  const hora      = document.getElementById("hora").value;
  const motivo    = document.getElementById("motivo").value.trim();

  if (!nombre || !tel || !categoria || !servicio || !fecha || !hora) {
    toast("Por favor completa todos los campos obligatorios.", "error");
    return;
  }

  const cita = {
    id: Date.now(), nombre, tel, categoria, servicio, fecha, hora, motivo,
    creada: new Date().toISOString()
  };
  appointments.push(cita);
  saveAppointments();

  const msg = buildWAMessage({ nombre, tel, categoria, servicio, fecha, hora, motivo });
  window.open(`https://wa.me/${CONFIG.whatsapp}?text=${msg}`, "_blank");

  toast("¡Cita registrada! WhatsApp abierto ✓", "success");
  this.reset();
  document.getElementById("servicio").innerHTML = '<option value="">— Primero elige categoría —</option>';
  renderCalendar();
  setNextSlot();
});

// ===== PANEL TERAPEUTA CON PIN =====
document.getElementById("pinBtn").addEventListener("click", checkPin);
document.getElementById("pinInput").addEventListener("keydown", function(e) {
  if (e.key === "Enter") checkPin();
});

function checkPin() {
  const input = document.getElementById("pinInput").value;
  if (input === CONFIG.pin) {
    isLoggedIn = true;
    document.getElementById("loginPanel").classList.add("hidden");
    document.getElementById("citasPanel").classList.remove("hidden");
    renderAppointments();
  } else {
    document.getElementById("pinError").classList.remove("hidden");
    document.getElementById("pinInput").value = "";
    document.getElementById("pinInput").focus();
  }
}

document.getElementById("logoutBtn").addEventListener("click", function () {
  isLoggedIn = false;
  document.getElementById("citasPanel").classList.add("hidden");
  document.getElementById("loginPanel").classList.remove("hidden");
  document.getElementById("pinInput").value = "";
  document.getElementById("pinError").classList.add("hidden");
});

function renderAppointments() {
  if (!isLoggedIn) return;
  const list = document.getElementById("appointmentsList");
  appointments = loadAppointments();

  if (!appointments.length) {
    list.innerHTML = '<p class="empty-state">Aún no hay citas agendadas.</p>';
    return;
  }

  const sorted = [...appointments].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

  const today = getDateKey(new Date());
  const upcoming = sorted.filter(a => a.fecha >= today);
  const past = sorted.filter(a => a.fecha < today);

  let html = "";

  if (upcoming.length) {
    html += `<p class="appt-section-label">Próximas citas (${upcoming.length})</p>`;
    html += upcoming.map(a => apptCard(a)).join("");
  }

  if (past.length) {
    html += `<p class="appt-section-label muted">Citas anteriores (${past.length})</p>`;
    html += past.map(a => apptCard(a, true)).join("");
  }

  list.innerHTML = html;
}

function apptCard(a, isPast = false) {
  const catLabel = a.categoria === "fisio" ? "Fisioterapia" : "Laminado & Rizado";
  const catClass = a.categoria === "estetica" ? "beauty" : "";
  return `
    <div class="appt-item ${isPast ? "past-item" : ""}">
      <div class="appt-info">
        <p class="appt-name">${a.nombre} <span class="appt-cat ${catClass}">${catLabel}</span></p>
        <p class="appt-meta">${formatDate(a.fecha)} · ${a.hora}</p>
        <p class="appt-meta">🩺 ${a.servicio}</p>
        ${a.motivo ? `<p class="appt-meta appt-note">💬 ${a.motivo}</p>` : ""}
        <p class="appt-meta">📱 ${a.tel}</p>
      </div>
      <div class="appt-actions">
        <a href="https://wa.me/${CONFIG.whatsapp}?text=${buildWAMessage(a)}"
           target="_blank" class="btn-wa-small">
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.106.548 4.083 1.508 5.797L0 24l6.334-1.482A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.854 0-3.6-.498-5.112-1.369l-.366-.218-3.762.88.924-3.672-.24-.378A9.935 9.935 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
          WA
        </a>
        <button class="btn-delete" onclick="deleteCita(${a.id})">Eliminar</button>
      </div>
    </div>
  `;
}

function deleteCita(id) {
  if (!confirm("¿Eliminar esta cita?")) return;
  appointments = appointments.filter(a => a.id !== id);
  saveAppointments();
  renderAppointments();
  renderCalendar();
  setNextSlot();
  toast("Cita eliminada.");
}

// ===== NAV HAMBURGER =====
document.getElementById("hamburger").addEventListener("click", function () {
  document.querySelector(".nav-links").classList.toggle("open");
});

// ===== FECHA MÍNIMA =====
(function setMinDate() {
  const today = getDateKey(new Date());
  document.getElementById("fecha").min = today;
  document.getElementById("fecha").addEventListener("change", function () {
    const [y, mo, d] = this.value.split("-");
    const date = new Date(+y, +mo - 1, +d);
    selectDay(date, this.value);
  });
})();

// ===== NAV CALENDARIO =====
document.getElementById("prevMonth").addEventListener("click", function () {
  viewDate.setMonth(viewDate.getMonth() - 1);
  renderCalendar();
});
document.getElementById("nextMonth").addEventListener("click", function () {
  viewDate.setMonth(viewDate.getMonth() + 1);
  renderCalendar();
});

// ===== INIT =====
renderCalendar();
setNextSlot();
