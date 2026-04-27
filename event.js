import {
    getFirestore, doc, getDoc, setDoc, arrayUnion, arrayRemove, Timestamp,
    collection, addDoc, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const db   = getFirestore();
const auth = getAuth();

let currentEventsArray  = [];
let currentArchivesData = null;
let editingEventId      = null;
let _userData           = null;

/* ══════════ HELPERS ══════════ */
const isUser = () => _userData?.role === 'user';

function toTimestamp(dateString) {
    if (!dateString) return null;
    return Timestamp.fromDate(new Date(dateString + "T12:00:00"));
}

function fromTimestampToInput(val) {
    if (!val) return "";
    try {
        let d = val.toDate ? val.toDate() : (val.seconds ? new Date(val.seconds * 1000) : new Date(val));
        return isNaN(d.getTime()) ? "" : d.toISOString().split('T')[0];
    } catch(err) { return ""; }
}

function formatSimpleDate(val) {
    if (!val) return "Date inconnue";
    try {
        let d = val.toDate ? val.toDate() : (val.seconds ? new Date(val.seconds * 1000) : new Date(val));
        return isNaN(d.getTime()) ? "Date inconnue" : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch(err) { return "Date inconnue"; }
}

/* ══════════ SOUMISSION D'UNE PROPOSITION ══════════ */
async function submitProposal(type, payload) {
    const user = auth.currentUser;
    if (!user) throw new Error("Non connecté.");

    const userRef  = doc(db, "users", user.email);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error("Utilisateur introuvable.");

    const ecole = document.getElementById('event-ecole-select').value;
    const annee = document.getElementById('event-annee-select').value;

    await addDoc(collection(db, "proposals"), {
        authorEmail:  user.email,
        authorPrenom: userSnap.data().prenom || "",
        ecole,
        annee,
        type,
        payload,
        status:    "pending",
        createdAt: serverTimestamp()
    });

    showEventStatus(`📤 Proposition envoyée !`);
}

function showEventStatus(msg, isError = false) {
    const el = document.getElementById('event-status');
    if (!el) return;
    el.textContent  = msg;
    el.style.color  = isError ? '#ed1c24' : '#28a745';
    if (!isError) setTimeout(() => { if(el) el.textContent = ''; }, 5000);
}

/* ══════════ CANCEL EDIT ══════════ */
function cancelEdit() {
    editingEventId = null;
    document.getElementById('title-local').innerText   = isUser() ? "Proposer un événement local" : "Ajouter un événement local";
    document.getElementById('local-orga').value        = 'BDE';
    updateListeDropdown();
    document.getElementById('local-nom').value         = '';
    document.getElementById('local-date').value        = '';
    document.getElementById('local-desc').value        = '';
    const btnMain = document.getElementById('btn-add-local');
    btnMain.innerText        = isUser() ? "📤 Soumettre une proposition" : "➕ Ajouter l'événement";
    btnMain.style.background = isUser() ? "var(--poly-cyan)" : "#f09433";
    document.getElementById('btn-cancel-edit').style.display = "none";
}

/* ══════════ CHARGEMENT ══════════ */
async function loadData() {
    cancelEdit();
    const ecole     = document.getElementById('event-ecole-select').value;
    const annee     = document.getElementById('event-annee-select').value;
    const container = document.getElementById('existing-events-container');
    container.innerHTML = '<p style="color:#aaa;">Chargement...</p>';
    try {
        const archiveSnap = await getDoc(doc(db, "ecoles", ecole, "archives", annee));
        currentArchivesData = archiveSnap.exists() ? archiveSnap.data() : null;
        updateListeDropdown();

        const eventSnap = await getDoc(doc(db, "ecoles", ecole, "events", annee));
        if (eventSnap.exists()) {
            const data = eventSnap.data();
            if (data.soiree) {
                document.getElementById('rezo-nom').value  = data.soiree.nom || '';
                document.getElementById('rezo-date').value = fromTimestampToInput(data.soiree.date);
            }
            currentEventsArray = data.locaux || [];
        } else {
            currentEventsArray = [];
        }
        renderExistingEvents();
    } catch(e) { container.innerHTML = '<p style="color:red;">Erreur.</p>'; }
}

function updateListeDropdown() {
    const orga      = document.getElementById('local-orga').value;
    const container = document.getElementById('container-liste-liee');
    const select    = document.getElementById('local-liste-liee');
    select.innerHTML = '<option value="">-- Sélectionner une liste --</option>';
    if (orga.includes('Liste') || orga === 'Fakeliste') {
        container.style.display = 'block';
        if (!currentArchivesData) return;
        let listes = orga === 'Liste BDE' ? currentArchivesData.listes_bde
            : orga === 'Liste BDP' ? currentArchivesData.listes_bdp
            : currentArchivesData.fakelistes;
        listes?.forEach(liste => {
            const opt = document.createElement('option');
            opt.value = liste.nom; opt.textContent = liste.nom;
            select.appendChild(opt);
        });
    } else {
        container.style.display = 'none';
    }
}

function renderExistingEvents() {
    const container = document.getElementById('existing-events-container');
    if (currentEventsArray.length === 0) {
        container.innerHTML = '<p style="color:#aaa;">Aucun événement local.</p>';
        return;
    }
    container.innerHTML = '';
    currentEventsArray.forEach(event => {
        const div = document.createElement('div');
        div.className = 'existing-item';
        const orgaText = event.orga + (event.listeLiee ? ` (${event.listeLiee})` : "");
        div.innerHTML = `
            <div class="existing-info">
                <span class="existing-name">${event.nom} <span style="font-weight:normal; font-size:0.8em; color:#f09433;">[${orgaText}]</span></span>
                <span class="existing-desc">📅 ${formatSimpleDate(event.date)} | 📍 ${event.desc || 'N/A'}</span>
            </div>
            <div class="action-buttons">
                ${!isUser() ? `<button class="btn-delete" data-id="${event.id}">Supprimer</button>` : ''}
                <button class="btn-edit" data-id="${event.id}">${isUser() ? '📤 Proposer modif' : 'Modifier'}</button>
            </div>`;
        container.appendChild(div);
    });
    document.querySelectorAll('.btn-delete').forEach(btn => btn.onclick = () => deleteEvent(btn.dataset.id));
    document.querySelectorAll('.btn-edit').forEach(btn => btn.onclick = () => startEditEvent(btn.dataset.id));
}

function startEditEvent(eventId) {
    const event = currentEventsArray.find(ev => ev.id === eventId);
    if (!event) return;
    editingEventId = eventId;
    document.getElementById('local-orga').value  = event.orga || 'BDE';
    updateListeDropdown();
    if (event.listeLiee) document.getElementById('local-liste-liee').value = event.listeLiee;
    document.getElementById('local-nom').value   = event.nom;
    document.getElementById('local-date').value  = fromTimestampToInput(event.date);
    document.getElementById('local-desc').value  = event.desc || '';
    document.getElementById('title-local').innerText = isUser() ? `📤 Proposer modif : ${event.nom}` : `✏️ Modification : ${event.nom}`;
    const btnMain = document.getElementById('btn-add-local');
    btnMain.innerText        = isUser() ? "📤 Soumettre la modification" : "💾 Enregistrer";
    btnMain.style.background = "var(--poly-cyan)";
    document.getElementById('btn-cancel-edit').style.display = "block";
    document.getElementById('card-local').scrollIntoView({ behavior: 'smooth' });
}

async function deleteEvent(eventId) {
    if (!confirm("Supprimer ?")) return;
    const ecole       = document.getElementById('event-ecole-select').value;
    const annee       = document.getElementById('event-annee-select').value;
    const eventToDelete = currentEventsArray.find(ev => ev.id === eventId);
    if (!eventToDelete) return;
    try {
        await setDoc(doc(db, "ecoles", ecole, "events", annee), { locaux: arrayRemove(eventToDelete) }, { merge: true });
        loadData();
    } catch (e) { console.error(e); }
}

/* ══════════ ADAPTATION UI POUR LES USERS ══════════ */
function applyEventUserModeUI() {
    // Masquer la section Rezo (les users ne proposent pas les events Rezo)
    const cardRezo = document.getElementById('btn-save-rezo')?.closest('.admin-card');
    if (cardRezo) {
        cardRezo.style.opacity = '0.4';
        cardRezo.style.pointerEvents = 'none';
        const note = document.createElement('p');
        note.style.cssText = 'color:#f09433; font-size:0.8em; text-align:center; margin-top:8px;';
        note.textContent = 'Section réservée aux éditeurs';
        cardRezo.appendChild(note);
    }

    // Zone de statut
    const statusEl = document.getElementById('event-status');
    if (!statusEl) {
        const s = document.createElement('p');
        s.id = 'event-status';
        s.style.cssText = 'text-align:center; font-size:0.9em; min-height:1.2em; margin-top:8px;';
        document.getElementById('card-local')?.insertAdjacentElement('afterend', s);
    }

    // Note d'avertissement
    const note = document.createElement('p');
    note.style.cssText = 'font-size:0.8em; color:#f09433; margin-bottom:12px; text-align:center;';
    note.textContent = '⚠️ Vos propositions seront soumises à validation avant publication.';
    document.getElementById('card-local')?.insertAdjacentElement('afterbegin', note);
}

/* ══════════ INIT ══════════ */
export function initEvent(userData) {
    _userData = userData;
    const schoolSelect = document.getElementById('event-ecole-select');

    // Restriction école pour les éditeurs
    if (userData && userData.role === 'editor') {
        const allowed = Array.isArray(userData.ecole) ? userData.ecole : [userData.ecole];
        Array.from(schoolSelect.options).forEach(opt => {
            if (opt.value && !allowed.includes(opt.value)) opt.remove();
        });
    }

    // Restriction école + UI user mode
    if (isUser()) {
        Array.from(schoolSelect.options).forEach(opt => {
            if (opt.value && opt.value !== userData.ecole) opt.remove();
        });
        schoolSelect.value    = userData.ecole;
        schoolSelect.disabled = true;
        applyEventUserModeUI();
    }

    /* ── Bouton Rezo (admin/editor uniquement) ── */
    document.getElementById('btn-save-rezo').onclick = async () => {
        if (isUser()) return;
        const ecole  = schoolSelect.value;
        const annee  = document.getElementById('event-annee-select').value;
        const nom    = document.getElementById('rezo-nom').value.trim();
        const rawDate = document.getElementById('rezo-date').value;
        if (!nom || !rawDate) return alert("Remplis tout !");
        try {
            await setDoc(doc(db, "ecoles", ecole, "events", annee), { soiree: { nom, date: toTimestamp(rawDate) } }, { merge: true });
            alert("✅ Rezo mis à jour !");
            loadData();
        } catch(e) { console.error(e); }
    };

    /* ── Bouton Ajouter / Proposer un event local ── */
    document.getElementById('btn-add-local').onclick = async () => {
        const ecole  = schoolSelect.value;
        const annee  = document.getElementById('event-annee-select').value;
        const nom    = document.getElementById('local-nom').value.trim();
        const rawDate = document.getElementById('local-date').value;
        const orga   = document.getElementById('local-orga').value;
        const desc   = document.getElementById('local-desc').value.trim();

        if (!nom || !rawDate) return alert("Remplis le nom et la date !");

        const eventId = editingEventId ? editingEventId : Date.now().toString();
        const newEvent = {
            id:        eventId,
            orga,
            listeLiee: (orga.includes('Liste') || orga === 'Fakeliste') ? document.getElementById('local-liste-liee').value : "",
            nom,
            date:      toTimestamp(rawDate),
            desc
        };

        if (isUser()) {
            /* MODE USER : soumettre proposition */
            try {
                const type = editingEventId ? 'event_local_edit' : 'event_local_add';
                await submitProposal(type, newEvent);
                cancelEdit();
            } catch(e) {
                showEventStatus("❌ " + e.message, true);
            }
            return;
        }

        /* MODE ADMIN/EDITOR : direct */
        try {
            const docRef = doc(db, "ecoles", ecole, "events", annee);
            if (editingEventId) {
                const updatedArray = currentEventsArray.map(ev => ev.id === editingEventId ? newEvent : ev);
                await setDoc(docRef, { locaux: updatedArray }, { merge: true });
            } else {
                await setDoc(docRef, { locaux: arrayUnion(newEvent) }, { merge: true });
            }
            loadData();
        } catch(e) { alert("Erreur"); }
    };

    schoolSelect.onchange = loadData;
    document.getElementById('event-annee-select').onchange = loadData;
    document.getElementById('local-orga').onchange = updateListeDropdown;
    document.getElementById('btn-cancel-edit').onclick = cancelEdit;
    loadData();
}
