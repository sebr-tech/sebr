import { getFirestore, doc, getDoc, setDoc, arrayUnion, arrayRemove, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = getFirestore(); 

let currentEventsArray = [];
let currentArchivesData = null;
let editingEventId = null; 

function toTimestamp(dateString) {
    if(!dateString) return null;
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

function cancelEdit() {
    editingEventId = null;
    document.getElementById('title-local').innerText = "Ajouter un événement local";
    document.getElementById('local-orga').value = 'BDE';
    updateListeDropdown();
    document.getElementById('local-nom').value = '';
    document.getElementById('local-date').value = '';
    document.getElementById('local-desc').value = '';
    const btnMain = document.getElementById('btn-add-local');
    btnMain.innerText = "➕ Ajouter l'événement";
    btnMain.style.background = "#f09433";
    document.getElementById('btn-cancel-edit').style.display = "none";
}

async function loadData() {
    cancelEdit(); 
    const ecole = document.getElementById('event-ecole-select').value;
    const annee = document.getElementById('event-annee-select').value;
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
                document.getElementById('rezo-nom').value = data.soiree.nom || '';
                document.getElementById('rezo-date').value = fromTimestampToInput(data.soiree.date);
            }
            currentEventsArray = data.locaux || [];
        } else currentEventsArray = [];
        renderExistingEvents();
    } catch(e) { container.innerHTML = '<p style="color:red;">Erreur.</p>'; }
}

function updateListeDropdown() {
    const orga = document.getElementById('local-orga').value;
    const container = document.getElementById('container-liste-liee');
    const select = document.getElementById('local-liste-liee');
    select.innerHTML = '<option value="">-- Sélectionner une liste --</option>';
    if (orga.includes('Liste') || orga === 'Fakeliste') {
        container.style.display = 'block';
        if (!currentArchivesData) return;
        let listes = orga === 'Liste BDE' ? currentArchivesData.listes_bde : (orga === 'Liste BDP' ? currentArchivesData.listes_bdp : currentArchivesData.fakelistes);
        listes?.forEach(liste => {
            const opt = document.createElement('option');
            opt.value = liste.nom; opt.textContent = liste.nom;
            select.appendChild(opt);
        });
    } else container.style.display = 'none';
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
        let orgaText = event.orga + (event.listeLiee ? ` (${event.listeLiee})` : "");
        div.innerHTML = `<div class="existing-info"><span class="existing-name">${event.nom} <span style="font-weight:normal; font-size:0.8em; color:#f09433;">[${orgaText}]</span></span><span class="existing-desc">📅 ${formatSimpleDate(event.date)} | 📍 ${event.desc || 'N/A'}</span></div><div class="action-buttons"><button class="btn-edit" data-id="${event.id}">Modifier</button><button class="btn-delete" data-id="${event.id}">Supprimer</button></div>`;
        container.appendChild(div);
    });
    document.querySelectorAll('.btn-delete').forEach(btn => btn.onclick = () => deleteEvent(btn.dataset.id));
    document.querySelectorAll('.btn-edit').forEach(btn => btn.onclick = () => startEditEvent(btn.dataset.id));
}

function startEditEvent(eventId) {
    const event = currentEventsArray.find(ev => ev.id === eventId);
    if (!event) return;
    editingEventId = eventId;
    document.getElementById('local-orga').value = event.orga || 'BDE';
    updateListeDropdown();
    if (event.listeLiee) document.getElementById('local-liste-liee').value = event.listeLiee;
    document.getElementById('local-nom').value = event.nom;
    document.getElementById('local-date').value = fromTimestampToInput(event.date);
    document.getElementById('local-desc').value = event.desc || '';
    document.getElementById('title-local').innerText = `✏️ Modification : ${event.nom}`;
    const btnMain = document.getElementById('btn-add-local');
    btnMain.innerText = "💾 Enregistrer";
    btnMain.style.background = "var(--poly-cyan)";
    document.getElementById('btn-cancel-edit').style.display = "block";
    document.getElementById('card-local').scrollIntoView({ behavior: 'smooth' });
}

async function deleteEvent(eventId) {
    if (!confirm("Supprimer ?")) return;
    const ecole = document.getElementById('event-ecole-select').value;
    const annee = document.getElementById('event-annee-select').value;
    const eventToDelete = currentEventsArray.find(ev => ev.id === eventId);
    if (!eventToDelete) return;
    try {
        await setDoc(doc(db, "ecoles", ecole, "events", annee), { locaux: arrayRemove(eventToDelete) }, { merge: true });
        loadData();
    } catch (e) { console.error(e); }
}

export function initEvent(userData) {
    const schoolSelect = document.getElementById('event-ecole-select');
    if (userData && userData.role !== 'admin') {
        const allowed = Array.isArray(userData.ecole) ? userData.ecole : [userData.ecole];
        Array.from(schoolSelect.options).forEach(opt => {
            if (opt.value && !allowed.includes(opt.value)) opt.remove();
        });
    }

    document.getElementById('btn-save-rezo').onclick = async () => {
        const ecole = schoolSelect.value;
        const annee = document.getElementById('event-annee-select').value;
        const nom = document.getElementById('rezo-nom').value.trim();
        const rawDate = document.getElementById('rezo-date').value;
        if(!nom || !rawDate) return alert("Remplis tout !");
        try {
            await setDoc(doc(db, "ecoles", ecole, "events", annee), { soiree: { nom, date: toTimestamp(rawDate) } }, { merge: true });
            alert("✅ Rezo mis à jour !");
            loadData();
        } catch(e) { console.error(e); }
    };

    document.getElementById('btn-add-local').onclick = async () => {
        const ecole = schoolSelect.value;
        const annee = document.getElementById('event-annee-select').value;
        const nom = document.getElementById('local-nom').value.trim();
        const rawDate = document.getElementById('local-date').value;
        const orga = document.getElementById('local-orga').value;
        const desc = document.getElementById('local-desc').value.trim();
        if(!nom || !rawDate) return alert("Remplis le nom et la date !");
        const eventId = editingEventId ? editingEventId : Date.now().toString();
        const newEvent = { id: eventId, orga, listeLiee: (orga.includes('Liste') || orga === 'Fakeliste') ? document.getElementById('local-liste-liee').value : "", nom, date: toTimestamp(rawDate), desc };
        try {
            const docRef = doc(db, "ecoles", ecole, "events", annee);
            if (editingEventId) {
                const updatedArray = currentEventsArray.map(ev => ev.id === editingEventId ? newEvent : ev);
                await setDoc(docRef, { locaux: updatedArray }, { merge: true });
            } else await setDoc(docRef, { locaux: arrayUnion(newEvent) }, { merge: true });
            loadData();
        } catch(e) { alert("Erreur"); }
    };

    schoolSelect.onchange = loadData;
    document.getElementById('event-annee-select').onchange = loadData;
    document.getElementById('local-orga').onchange = updateListeDropdown;
    document.getElementById('btn-cancel-edit').onclick = cancelEdit;
    loadData();
}