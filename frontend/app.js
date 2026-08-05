const $ = (selector) => document.querySelector(selector);
const state = { apiUrl: localStorage.getItem("hipfApiUrl") || "", events: [] };
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

function api(path) {
  if (!state.apiUrl) throw new Error("Add your SAM API Gateway URL in API connection settings first.");
  return `${state.apiUrl.replace(/\/$/, "")}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(api(path), { headers: { "Content-Type": "application/json", ...options.headers }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function setMessage(selector, message, type = "") {
  const element = $(selector);
  element.textContent = message;
  element.className = `${element.className.split(" ")[0]} ${type}`.trim();
}

function formatDate(value) {
  if (!value) return "Date to be announced";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date) ? value : date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function renderEvents(events) {
  const list = $("#events-list");
  const select = $("#event-id");
  list.innerHTML = "";
  select.innerHTML = '<option value="">Choose an event</option>';
  events.forEach((event) => {
    const title = event.eventName || event.eventId;
    const card = document.createElement("article");
    card.className = "event-card";
    card.innerHTML = `<div class="event-date">${escapeHtml(formatDate(event.date))}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(event.description || "Join us in supporting the Home-in Prison Foundation.")}</p><button class="text-button" type="button">Register for this event →</button>`;
    card.querySelector("button").addEventListener("click", () => { select.value = event.eventId; $("#register").scrollIntoView(); });
    list.append(card);
    const option = document.createElement("option");
    option.value = event.eventId;
    option.textContent = `${title} — ${formatDate(event.date)}`;
    select.append(option);
  });
}

async function loadEvents() {
  try {
    setMessage("#events-status", "Loading fundraising events…");
    const data = await request("/events");
    state.events = data.events || [];
    renderEvents(state.events);
    setMessage("#events-status", state.events.length ? `${state.events.length} event${state.events.length === 1 ? "" : "s"} available.` : "No events are available yet.");
  } catch (error) { setMessage("#events-status", error.message, "error"); }
}

$("#save-api-url").addEventListener("click", async () => {
  const input = $("#api-url");
  const value = input.value.trim().replace(/\/$/, "");
  if (!/^https:\/\//.test(value)) return setMessage("#api-result", "Enter a valid HTTPS API Gateway URL.", "error");
  state.apiUrl = value;
  localStorage.setItem("hipfApiUrl", value);
  setMessage("#api-result", "API URL saved. Loading events…", "success");
  await loadEvents();
});

$("#refresh-events").addEventListener("click", loadEvents);
$("#registration-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    setMessage("#registration-result", "Saving your registration…");
    const data = await request("/register", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    setMessage("#registration-result", `You’re registered. Your confirmation ID is ${data.registration.registrationId}.`, "success");
    event.currentTarget.reset();
  } catch (error) { setMessage("#registration-result", error.message, "error"); }
});

function renderRegistrations(registrations) {
  const list = $("#registrations-list");
  list.innerHTML = registrations.length ? "" : "<p class='status-message'>No registrations found for that email address.</p>";
  registrations.forEach((registration) => {
    const item = document.createElement("article");
    item.className = "registration-item";
    item.innerHTML = `<div><h3>${escapeHtml(registration.eventName || registration.eventId)}</h3><p>Confirmed · ${escapeHtml(registration.email)}</p></div><button class="cancel-button" type="button">Cancel registration</button>`;
    item.querySelector("button").addEventListener("click", () => cancelRegistration(registration.registrationId));
    list.append(item);
  });
}

async function cancelRegistration(id) {
  if (!window.confirm("Cancel this registration?")) return;
  try {
    await request(`/registration/${encodeURIComponent(id)}`, { method: "DELETE" });
    const email = $("#lookup-email").value.trim();
    setMessage("#registrations-list", "Registration cancelled.", "success");
    if (email) $("#lookup-form").requestSubmit();
  } catch (error) { setMessage("#registrations-list", error.message, "error"); }
}

$("#lookup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#lookup-email").value.trim();
  try {
    $("#registrations-list").innerHTML = "<p class='status-message'>Looking up registrations…</p>";
    const data = await request(`/registrations/${encodeURIComponent(email)}`);
    renderRegistrations(data.registrations || []);
  } catch (error) { $("#registrations-list").innerHTML = `<p class="status-message error">${error.message}</p>`; }
});

$("#api-url").value = state.apiUrl;
$("#year").textContent = new Date().getFullYear();
if (state.apiUrl) loadEvents();
