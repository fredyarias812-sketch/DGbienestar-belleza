// ╔══════════════════════════════════════════════════════╗
// ║  CONFIGURACIÓN                                      ║
// ╚══════════════════════════════════════════════════════╝
const CONFIG = {
  nombreFisio : "Diana Gisel",
  negocio     : "DG Bienestar y Belleza",
  whatsapp    : "523112685690",  // ← número real de Diana (52 + 10 dígitos)
  duracionMin : 60,
  pin         : "0922",
  // ↓ Pega aquí la URL del Web App de Google Apps Script
  sheetURL    :"https://script.google.com/macros/s/AKfycbyDWNlJ9JukghKlBc4xlUiSHNcDvuoVygEBNkDSElQXDFBcOp-rjEJqPc7yEpFayLwudQ/exec",
  horarios: {
    0: [9,  14],   // Domingo   9am-2pm
    1: [16, 20],
    2: [16, 20],
    3: [16, 20],
    4: [16, 20],
    5: [16, 20],
    6: [15, 19],   // Sabado    3pm-7pm
  },
};

const SERVICIOS = {
  fisio: [
    "Prevención de dolores y recuperación de lesiones",
    "Dolor lumbar","Dolor en cuello y hombros","Terapia manual",
    "Ejercicio terapéutico","Esguinces","Parálisis facial",
    "Masaje terapéutico / relajante / descontracturante",
  ],
  estetica: [
    "Laminado de cejas","Visagismo","Pigmento",
    "Depilación con pinza o navaja","Rizado de pestañas",
  ],
};

// ╔══════════════════════════════════════════════════════╗
// ║  ESTADO                                             ║
// ╚══════════════════════════════════════════════════════╝
var appointments   = [];
var diasBloqueados = new Set();
var viewDate       = new Date();
var selectedDate   = null;
var isLoggedIn     = false;

// ╔══════════════════════════════════════════════════════╗
// ║  API — JSONP para GET, no-cors para POST            ║
// ╚══════════════════════════════════════════════════════╝

// GET con JSONP: crea un <script> tag que bypasea CORS completamente
function jsonpGET(params) {
  return new Promise(function(resolve) {
    if (!CONFIG.sheetURL) { resolve(null); return; }

    var cbName = "_cb_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
    params.callback = cbName;

    var url = CONFIG.sheetURL + "?" + Object.keys(params)
      .map(function(k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); })
      .join("&");

    var timeout = setTimeout(function() {
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      console.warn("JSONP timeout");
      resolve(null);
    }, 10000);

    window[cbName] = function(data) {
      clearTimeout(timeout);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      resolve(data);
    };

    var script = document.createElement("script");
    script.src = url;
    script.onerror = function() {
      clearTimeout(timeout);
      delete window[cbName];
      resolve(null);
    };
    document.head.appendChild(script);
  });
}

// POST con no-cors: no recibe respuesta pero SÍ escribe en Sheets
function nocorsPOST(payload) {
  return new Promise(function(resolve) {
    if (!CONFIG.sheetURL) { resolve(null); return; }
    fetch(CONFIG.sheetURL, {
      method: "POST",
      mode  : "no-cors",   // bypasea CORS — no recibimos respuesta pero el POST llega
      body  : JSON.stringify(payload),
    })
    .then(function() { resolve({ ok: true }); })
    .catch(function(e) { console.warn("POST error:", e); resolve(null); });
  });
}

async function cargarDatos() {
  mostrarCargando(true);
  try {
    var res = await jsonpGET({ action: "getAll" });
    if (res && res.ok) {
      appointments = Array.isArray(res.citas)
        ? res.citas.map(function(c) {
            var o = {}; Object.keys(c).forEach(function(k){ o[k]=c[k]; });
            o.id = Number(c.id) || c.id; return o;
          })
        : [];
      diasBloqueados = new Set(Array.isArray(res.bloqueados) ? res.bloqueados : []);
    }
  } catch(e) { console.warn("cargarDatos:", e); }
  mostrarCargando(false);
  renderCalendar();
  setNextSlot();
  if (isLoggedIn) {
    renderAppointments();
    renderDiasBloqueados();
    renderMiniCal();
  }
}

// ╔══════════════════════════════════════════════════════╗
// ║  UTILIDADES                                         ║
// ╚══════════════════════════════════════════════════════╝
function getDateKey(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth()+1).padStart(2,"0") + "-" +
    String(d.getDate()).padStart(2,"0");
}
function parseDateKey(k) {
  var p = String(k).split("-");
  return new Date(+p[0], +p[1]-1, +p[2]);
}
function formatDate(k) {
  try { return parseDateKey(k).toLocaleDateString("es-MX",{weekday:"long",year:"numeric",month:"long",day:"numeric"}); }
  catch(e) { return k; }
}
function getSlotsForDay(dow) {
  var h = CONFIG.horarios[dow]; if (!h) return [];
  var slots=[], hr=h[0], mn=0;
  while(hr<h[1]){
    slots.push(String(hr).padStart(2,"0")+":"+String(mn).padStart(2,"0"));
    mn+=CONFIG.duracionMin; if(mn>=60){hr+=Math.floor(mn/60);mn%=60;}
  }
  return slots;
}
function getSlotsForDate(key) {
  var all   = getSlotsForDay(parseDateKey(key).getDay());
  var taken = appointments.filter(function(a){return String(a.fecha)===String(key);}).map(function(a){return String(a.hora);});
  return all.map(function(t){return{time:t,taken:taken.indexOf(t)!==-1};});
}
function getDayStatus(date) {
  var key=getDateKey(date);
  if(diasBloqueados.has(key)) return "closed";
  var all=getSlotsForDay(date.getDay()); if(!all.length) return "closed";
  var taken=appointments.filter(function(a){return String(a.fecha)===key;}).length;
  if(taken===0)            return "available";
  if(taken<all.length*.7) return "available";
  if(taken<all.length)    return "partial";
  return "full";
}
function toast(msg,type){
  var el=document.getElementById("toast"); if(!el) return;
  el.textContent=msg; el.className="toast"+(type?" "+type:"");
  setTimeout(function(){el.className="toast hidden";},3500);
}
function mostrarCargando(show){
  var el=document.getElementById("loadingOverlay"); if(el) el.style.display=show?"flex":"none";
}
function setNextSlot(){
  var el=document.getElementById("nextSlotHero"); if(!el) return;
  var now=new Date();
  for(var i=0;i<30;i++){
    var d=new Date(now); d.setDate(d.getDate()+i);
    var key=getDateKey(d);
    if(diasBloqueados.has(key)) continue;
    var all=getSlotsForDay(d.getDay()); if(!all.length) continue;
    var taken=appointments.filter(function(a){return String(a.fecha)===key;}).map(function(a){return String(a.hora);});
    var free=all.filter(function(s){return taken.indexOf(s)===-1;});
    if(free.length){
      el.textContent=i===0?"Hoy · "+free[0]:d.toLocaleDateString("es-MX",{weekday:"short",month:"short",day:"numeric"})+" · "+free[0];
      return;
    }
  }
  el.textContent="Sin disponibilidad próxima";
}

// ╔══════════════════════════════════════════════════════╗
// ║  CALENDARIO PÚBLICO                                 ║
// ╚══════════════════════════════════════════════════════╝
var MESES=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function renderCalendar(){
  var grid=document.getElementById("calGrid"), label=document.getElementById("calMonthLabel");
  if(!grid||!label) return; grid.innerHTML="";
  var y=viewDate.getFullYear(), mo=viewDate.getMonth();
  var today=new Date(); today.setHours(0,0,0,0);
  label.textContent=MESES[mo]+" "+y;
  var firstDay=new Date(y,mo,1).getDay(), days=new Date(y,mo+1,0).getDate();
  for(var i=0;i<firstDay;i++){var e=document.createElement("div");e.className="cal-day empty";grid.appendChild(e);}
  for(var d=1;d<=days;d++){
    (function(day){
      var date=new Date(y,mo,day), key=getDateKey(date);
      var el=document.createElement("div"); el.textContent=day; el.className="cal-day";
      if(date<today){el.classList.add("past");}
      else{
        var st=getDayStatus(date);
        if(st==="closed"){el.classList.add("closed");}
        else{
          el.classList.add(st==="full"?"full":st==="partial"?"partial":"available");
          el.addEventListener("click",function(){selectDay(date,key);});
        }
      }
      if(date.toDateString()===today.toDateString()) el.classList.add("today");
      if(selectedDate&&key===selectedDate) el.classList.add("selected");
      grid.appendChild(el);
    })(d);
  }
}

function selectDay(date,key){
  selectedDate=key; renderCalendar(); renderSlots(date,key);
  var fi=document.getElementById("fecha"); if(fi) fi.value=key;
}

function renderSlots(date,key){
  var wrap=document.getElementById("slotsWrap"),title=document.getElementById("slotsTitle"),
      grid=document.getElementById("slotsGrid"),sel=document.getElementById("hora");
  if(!wrap||!title||!grid||!sel) return;
  title.textContent=date.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"});
  grid.innerHTML=""; sel.innerHTML='<option value="">— Selecciona hora —</option>';
  if(diasBloqueados.has(key)){
    grid.innerHTML='<p style="color:var(--red);font-size:14px;font-weight:500;">⛔ Este día no está disponible.</p>';
    wrap.style.display="block"; return;
  }
  var slots=getSlotsForDate(key);
  if(!slots.length){grid.innerHTML='<p style="color:var(--text-muted);font-size:14px;">No hay horario disponible este día.</p>';wrap.style.display="block";return;}
  slots.forEach(function(s){
    var btn=document.createElement("button"); btn.type="button"; btn.textContent=s.time;
    btn.className="slot-btn"+(s.taken?" taken":"");
    if(!s.taken){
      btn.addEventListener("click",function(){
        document.querySelectorAll(".slot-btn").forEach(function(b){b.classList.remove("selected");});
        btn.classList.add("selected"); sel.value=s.time;
        document.getElementById("agendar").scrollIntoView({behavior:"smooth",block:"start"});
      });
      var opt=document.createElement("option"); opt.value=s.time; opt.textContent=s.time; sel.appendChild(opt);
    }
    grid.appendChild(btn);
  });
  wrap.style.display="block";
}

// ╔══════════════════════════════════════════════════════╗
// ║  SERVICIOS DINÁMICOS                                ║
// ╚══════════════════════════════════════════════════════╝
document.getElementById("categoria").addEventListener("change",function(){
  var s=document.getElementById("servicio");
  s.innerHTML='<option value="">— Elige un servicio —</option>';
  (SERVICIOS[this.value]||[]).forEach(function(v){var o=document.createElement("option");o.value=v;o.textContent=v;s.appendChild(o);});
});

// ╔══════════════════════════════════════════════════════╗
// ║  FORMULARIO                                         ║
// ╚══════════════════════════════════════════════════════╝
function buildWAMessage(a){
  return encodeURIComponent(
    "¡Hola "+CONFIG.nombreFisio+"! — *"+CONFIG.negocio+"* 👋\n\n"+
    "Nueva solicitud de cita:\n\n"+
    "👤 *Nombre:* "+a.nombre+"\n📱 *WhatsApp:* "+a.tel+"\n"+
    "📅 *Fecha:* "+formatDate(String(a.fecha))+"\n🕐 *Hora:* "+a.hora+"\n"+
    "🗂️ *Categoría:* "+(a.categoria==="fisio"?"Fisioterapia":"Laminado & Rizado")+"\n"+
    "🩺 *Servicio:* "+a.servicio+"\n"+
    (a.motivo?"📝 *Comentarios:* "+a.motivo+"\n":"")+
    "\n¿Confirmas la cita? ¡Gracias!"
  );
}

document.getElementById("apptForm").addEventListener("submit",async function(e){
  e.preventDefault();
  var nombre=document.getElementById("nombre").value.trim(),
      tel=document.getElementById("tel").value.trim(),
      categoria=document.getElementById("categoria").value,
      servicio=document.getElementById("servicio").value,
      fecha=document.getElementById("fecha").value,
      hora=document.getElementById("hora").value,
      motivo=document.getElementById("motivo").value.trim();
  if(!nombre||!tel||!categoria||!servicio||!fecha||!hora){toast("Completa todos los campos obligatorios.","error");return;}
  if(diasBloqueados.has(fecha)){toast("Ese día no está disponible.","error");return;}

  var btn=document.getElementById("submitBtn");
  btn.disabled=true; btn.textContent="Guardando…";

  var cita={id:Date.now(),nombre:nombre,tel:tel,categoria:categoria,servicio:servicio,fecha:fecha,hora:hora,motivo:motivo,creada:new Date().toISOString()};

  // Actualizar UI inmediatamente
  appointments.push(cita);
  renderCalendar(); setNextSlot();
  if(isLoggedIn) renderAppointments();

  // Guardar en Sheets (no-cors: el POST llega pero no recibimos confirmación)
  if(CONFIG.sheetURL) await nocorsPOST({action:"addCita",cita:cita});

  window.open("https://wa.me/"+CONFIG.whatsapp+"?text="+buildWAMessage(cita),"_blank");
  toast("¡Cita registrada! ✓","success");
  this.reset();
  document.getElementById("servicio").innerHTML='<option value="">— Primero elige categoría —</option>';
  btn.disabled=false; btn.textContent="Confirmar cita vía WhatsApp →";
});

// ╔══════════════════════════════════════════════════════╗
// ║  PANEL DIANA — PIN                                  ║
// ╚══════════════════════════════════════════════════════╝
function checkPin(){
  var input=document.getElementById("pinInput"), error=document.getElementById("pinError");
  if(!input) return;
  if(input.value===CONFIG.pin){
    isLoggedIn=true;
    document.getElementById("loginPanel").classList.add("hidden");
    document.getElementById("citasPanel").classList.remove("hidden");
    cargarDatos(); // recarga datos frescos al entrar
  } else {
    if(error) error.classList.remove("hidden");
    input.value=""; input.focus();
  }
}
document.getElementById("pinBtn").addEventListener("click",checkPin);
document.getElementById("pinInput").addEventListener("keydown",function(e){if(e.key==="Enter")checkPin();});
document.getElementById("logoutBtn").addEventListener("click",function(){
  isLoggedIn=false;
  document.getElementById("citasPanel").classList.add("hidden");
  document.getElementById("loginPanel").classList.remove("hidden");
  document.getElementById("pinInput").value="";
  var err=document.getElementById("pinError"); if(err) err.classList.add("hidden");
});

// ╔══════════════════════════════════════════════════════╗
// ║  BLOQUEO DE DÍAS                                    ║
// ╚══════════════════════════════════════════════════════╝
async function handleToggleBloqueo(key){
  var estaba=diasBloqueados.has(key);
  if(estaba) diasBloqueados.delete(key); else diasBloqueados.add(key);
  renderCalendar(); setNextSlot(); renderDiasBloqueados(); renderMiniCal();
  toast(estaba?formatDate(key)+" reactivado ✓":formatDate(key)+" bloqueado ⛔",estaba?"success":"");
  if(CONFIG.sheetURL) await nocorsPOST({action:"toggleBloqueo",dateKey:key,bloqueado:estaba});
}

function renderDiasBloqueados(){
  var wrap=document.getElementById("diasBloqueadosWrap"); if(!wrap) return;
  var hoy=getDateKey(new Date());
  var lista=Array.from(diasBloqueados).filter(function(k){return k>=hoy;}).sort();
  if(!lista.length){wrap.innerHTML='<p class="empty-state" style="font-size:13px;">Ningún día bloqueado próximamente.</p>';return;}
  wrap.innerHTML=lista.map(function(k){
    return '<div class="dia-bloq-item"><span>'+formatDate(k)+'</span><button class="btn-reactivar" onclick="handleToggleBloqueo(\''+k+'\')">Reactivar</button></div>';
  }).join("");
}

function renderMiniCal(){
  var grid=document.getElementById("miniCalGrid"),label=document.getElementById("miniCalLabel");
  if(!grid||!label) return; grid.innerHTML="";
  var y=viewDate.getFullYear(),mo=viewDate.getMonth();
  var today=new Date(); today.setHours(0,0,0,0);
  label.textContent=MESES[mo]+" "+y;
  var firstDay=new Date(y,mo,1).getDay(),days=new Date(y,mo+1,0).getDate();
  for(var i=0;i<firstDay;i++){var e2=document.createElement("div");e2.className="mini-cal-day empty";grid.appendChild(e2);}
  for(var d=1;d<=days;d++){
    (function(day){
      var date=new Date(y,mo,day),key=getDateKey(date);
      var el=document.createElement("div"); el.textContent=day; el.className="mini-cal-day";
      var noLabora=getSlotsForDay(date.getDay()).length===0;
      if(date<today||noLabora){el.classList.add("mini-past");}
      else{
        if(diasBloqueados.has(key)) el.classList.add("mini-bloq");
        el.title=diasBloqueados.has(key)?"Clic para reactivar":"Clic para bloquear";
        el.addEventListener("click",function(){handleToggleBloqueo(key);});
      }
      grid.appendChild(el);
    })(d);
  }
}
document.getElementById("miniPrevMonth").addEventListener("click",function(){viewDate.setMonth(viewDate.getMonth()-1);renderCalendar();renderMiniCal();});
document.getElementById("miniNextMonth").addEventListener("click",function(){viewDate.setMonth(viewDate.getMonth()+1);renderCalendar();renderMiniCal();});

// ╔══════════════════════════════════════════════════════╗
// ║  LISTA DE CITAS                                     ║
// ╚══════════════════════════════════════════════════════╝
function renderAppointments(){
  if(!isLoggedIn) return;
  var list=document.getElementById("appointmentsList"); if(!list) return;
  if(!appointments.length){list.innerHTML='<p class="empty-state">Aún no hay citas agendadas.</p>';return;}
  var sorted=appointments.slice().sort(function(a,b){return(String(a.fecha)+String(a.hora)).localeCompare(String(b.fecha)+String(b.hora));});
  var hoy=getDateKey(new Date());
  var up=sorted.filter(function(a){return String(a.fecha)>=hoy;});
  var past=sorted.filter(function(a){return String(a.fecha)<hoy;});
  var html="";
  if(up.length){html+='<p class="appt-section-label">Próximas citas ('+up.length+')</p>';html+=up.map(apptCard).join("");}
  if(past.length){html+='<p class="appt-section-label muted">Anteriores ('+past.length+')</p>';html+=past.map(function(a){return apptCard(a,true);}).join("");}
  list.innerHTML=html;
}

function apptCard(a,isPast){
  var cat=a.categoria==="fisio"?"Fisioterapia":"Laminado & Rizado";
  var cls=a.categoria==="estetica"?"beauty":"";
  var tel=String(a.tel||"").replace(/\D/g,"");
  return '<div class="appt-item'+(isPast?' past-item':'')+'">'+
    '<div class="appt-info">'+
      '<p class="appt-name">'+a.nombre+' <span class="appt-cat '+cls+'">'+cat+'</span></p>'+
      '<p class="appt-meta">'+formatDate(String(a.fecha))+' · '+a.hora+'</p>'+
      '<p class="appt-meta">🩺 '+a.servicio+'</p>'+
      (a.motivo?'<p class="appt-meta appt-note">💬 '+a.motivo+'</p>':'')+
      '<p class="appt-meta">📱 <a href="https://wa.me/'+tel+'" target="_blank" style="color:var(--sage)">'+a.tel+'</a></p>'+
    '</div>'+
    '<div class="appt-actions">'+
      '<a href="https://wa.me/'+CONFIG.whatsapp+'?text='+buildWAMessage(a)+'" target="_blank" class="btn-wa-small">'+
        '<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.106.548 4.083 1.508 5.797L0 24l6.334-1.482A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.854 0-3.6-.498-5.112-1.369l-.366-.218-3.762.88.924-3.672-.24-.378A9.935 9.935 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>WA'+
      '</a>'+
      '<button class="btn-delete" onclick="borrarCita('+a.id+')">Eliminar</button>'+
    '</div>'+
  '</div>';
}

async function borrarCita(id){
  if(!confirm("¿Eliminar esta cita?")) return;
  appointments=appointments.filter(function(a){return a.id!==id;});
  renderAppointments(); renderCalendar(); setNextSlot();
  toast("Cita eliminada.");
  if(CONFIG.sheetURL) await nocorsPOST({action:"deleteCita",id:String(id)});
}

// ╔══════════════════════════════════════════════════════╗
// ║  NAV / FECHAS / INICIO                              ║
// ╚══════════════════════════════════════════════════════╝
document.getElementById("hamburger").addEventListener("click",function(){document.querySelector(".nav-links").classList.toggle("open");});
var fi=document.getElementById("fecha");
fi.min=getDateKey(new Date());
fi.addEventListener("change",function(){var p=this.value.split("-");if(p.length===3)selectDay(new Date(+p[0],+p[1]-1,+p[2]),this.value);});
document.getElementById("prevMonth").addEventListener("click",function(){viewDate.setMonth(viewDate.getMonth()-1);renderCalendar();});
document.getElementById("nextMonth").addEventListener("click",function(){viewDate.setMonth(viewDate.getMonth()+1);renderCalendar();});

// Refresco cada 90 segundos
setInterval(function(){if(CONFIG.sheetURL) cargarDatos();},90000);

// INICIO
renderCalendar();
setNextSlot();
cargarDatos();
