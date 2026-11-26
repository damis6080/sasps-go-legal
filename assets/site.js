/* Formulario de contacto de SASPS GO. Sin dependencias, sin cookies, sin almacenamiento local, sin analítica.
   Solo se comunica con el endpoint configurado en config.js (Formspree) y ÚNICAMENTE cuando la persona pulsa «Enviar». */
(function () {
  "use strict";
  var form = document.getElementById("contact-form");
  if (!form) return;

  var cfg = window.SASPS_SITE || {};
  var endpoint = (cfg.formEndpoint || "").trim();
  var valid = /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(endpoint);
  var loadedAt = Date.now();
  var MIN_MS = 4000;          // un envío humano tarda más: se descarta lo instantáneo
  var COOLDOWN_MS = 30000;    // tras un envío correcto, pausa para evitar duplicados
  var sending = false, lastOk = 0;

  var els = {
    notice: document.getElementById("form-notice"),
    submit: document.getElementById("submit"),
    label: document.getElementById("submit-label"),
    spinner: document.getElementById("submit-spinner"),
    done: document.getElementById("form-done"),
    count: document.getElementById("msg-count"),
    status: document.getElementById("form-status")
  };

  function setNotice(kind, title, text) {
    els.notice.hidden = false;
    els.notice.className = "notice " + kind;
    els.notice.innerHTML = "";
    var s = document.createElement("strong"); s.textContent = title;
    var p = document.createElement("span"); p.textContent = text;
    els.notice.appendChild(s); els.notice.appendChild(p);
  }

  // Estado «no configurado»: el formulario NO simula envíos.
  if (!valid) {
    setNotice("warn", "Formulario todavía no activo",
      "El servicio que recibe los mensajes aún no está conectado a esta página, así que por ahora no se pueden enviar solicitudes desde aquí.");
    els.submit.disabled = true;
    Array.prototype.forEach.call(form.querySelectorAll("input, select, textarea"), function (e) { e.disabled = true; });
    return;
  }

  function field(name) { return form.elements[name]; }
  function showError(name, msg) {
    var f = field(name); if (!f) return;
    var wrap = f.closest(".field") || f.parentNode;
    var out = wrap.querySelector(".err");
    wrap.classList.toggle("invalid", !!msg);
    if (out) out.textContent = msg || "";
    f.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  function validate() {
    var errs = {};
    var name = field("name").value.trim(), email = field("email").value.trim(), msg = field("message").value.trim();
    if (name.length > 80) errs.name = "Máximo 80 caracteres.";
    if (!email) errs.email = "Escribe tu correo para que podamos responderte.";
    else if (email.length > 254 || !/^[^\s@<>()\[\]\\,;:]+@[^\s@<>()\[\]\\,;:]+\.[A-Za-z]{2,}$/.test(email)) errs.email = "Escribe un correo válido, por ejemplo nombre@dominio.com.";
    if (!field("type").value) errs.type = "Elige el tipo de solicitud.";
    if (!field("app").value) errs.app = "Elige a qué se refiere.";
    if (msg.length < 20) errs.message = "Cuéntanos un poco más (mínimo 20 caracteres).";
    else if (msg.length > 2000) errs.message = "Máximo 2000 caracteres.";
    else if (/(contrase(ñ|n)a|password|token|c[oó]digo)\s*[:=]\s*\S+/i.test(msg)) errs.message = "Parece que incluyes una contraseña, token o código. Quítalo: nunca te los pediremos.";
    if (!field("consent").checked) errs.consent = "Necesitamos tu confirmación para tratar tu mensaje.";
    ["name", "email", "type", "app", "message", "consent"].forEach(function (n) { showError(n, errs[n] || ""); });
    var first = Object.keys(errs)[0];
    if (first) field(first).focus();
    return !first;
  }

  field("message").addEventListener("input", function () { els.count.textContent = field("message").value.length + " / 2000"; });
  ["name", "email", "type", "app", "message", "consent"].forEach(function (n) {
    field(n).addEventListener("change", function () { showError(n, ""); });
  });

  function busy(on) {
    sending = on;
    els.submit.disabled = on;
    els.spinner.hidden = !on;
    els.label.textContent = on ? "Enviando…" : "Enviar mensaje";
    els.status.textContent = on ? "Enviando el mensaje" : "";
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (sending) return;
    els.notice.hidden = true;
    if (Date.now() - lastOk < COOLDOWN_MS) { setNotice("warn", "Un momento", "Ya enviamos tu mensaje. Espera unos segundos antes de enviar otro."); return; }
    if (field("_gotcha").value) { return; }                 // trampa para bots: se ignora en silencio
    if (!validate()) return;
    if (Date.now() - loadedAt < MIN_MS) { setNotice("warn", "Demasiado rápido", "Revisa el mensaje y vuelve a pulsar «Enviar» en unos segundos."); return; }

    var data = new FormData();
    data.append("name", field("name").value.trim());
    data.append("email", field("email").value.trim());
    data.append("tipo", field("type").selectedOptions[0].text);
    data.append("aplicacion", field("app").selectedOptions[0].text);
    data.append("message", field("message").value.trim());
    data.append("_subject", "[SASPS GO] " + field("type").selectedOptions[0].text + " — " + field("app").selectedOptions[0].text);
    data.append("_gotcha", "");

    busy(true);
    var ctl = new AbortController(); var timer = setTimeout(function () { ctl.abort(); }, 15000);
    fetch(endpoint, { method: "POST", body: data, headers: { Accept: "application/json" }, signal: ctl.signal })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
      })
      .then(function (res) {
        if (res.ok && res.body && res.body.ok === true) {   // éxito SOLO si Formspree confirma que recibió el mensaje
          lastOk = Date.now();
          form.hidden = true; els.done.hidden = false; els.done.focus();
          form.reset(); els.count.textContent = "0 / 2000";
        } else if (res.status === 422 && res.body && res.body.errors) {
          var m = res.body.errors.map(function (e) { return e.message; }).join(" ");
          setNotice("bad", "No pudimos enviar el mensaje", m || "Revisa los datos e inténtalo otra vez.");
        } else if (res.ok) {
          setNotice("bad", "No pudimos confirmar el envío", "El servicio respondió, pero no confirmó la recepción. No des el mensaje por enviado: inténtalo de nuevo.");
        } else if (res.status === 429) {
          setNotice("bad", "Demasiados envíos", "Se alcanzó el límite temporal. Inténtalo de nuevo más tarde.");
        } else {
          setNotice("bad", "No pudimos enviar el mensaje", "El servicio de recepción respondió con un error (" + res.status + "). Tus datos siguen en el formulario: inténtalo de nuevo en unos minutos.");
        }
      })
      .catch(function (e) {
        setNotice("bad", "Sin conexión con el servicio", (e && e.name === "AbortError" ? "La solicitud tardó demasiado. " : "No se pudo conectar. ") + "Comprueba tu conexión e inténtalo de nuevo; tus datos siguen en el formulario.");
      })
      .then(function () { clearTimeout(timer); busy(false); });
  });

  var again = document.getElementById("send-another");
  if (again) again.addEventListener("click", function () { els.done.hidden = true; form.hidden = false; loadedAt = Date.now(); field("name").focus(); });
})();
