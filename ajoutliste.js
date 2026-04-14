import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB1_SgV4E80Qxs2vQ-_jIGexv6YYqaiARs",
    authDomain: "sebr-dea8d.firebaseapp.com",
    projectId: "sebr-dea8d",
    storageBucket: "sebr-dea8d.firebasestorage.app",
    messagingSenderId: "948314281215",
    appId: "1:948314281215:web:1fddf38350d9a3663e68ca"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const IMGBB_API_KEY = "9d62b3a6a9d75ffdc8621c7eb58f1181";
const REMOVE_BG_API_KEY = "GzD4aRxmuijz2vhL7xAkrmy3";

let currentData = {
    bde_actuel: { prez: "", photo: "", insta: "", photo_coll: "" },
    bdp_actuel: { prez: "", photo: "", insta: "", photo_coll: "" },
    listes_bde: [], listes_bdp: [], fakelistes: [],
    campagne_start: null, campagne_end: null, passation_date: null
};

let editingType = null;
let editingIndex = null;

async function removeBackground(file) {
    const formData = new FormData();
    formData.append("image_file", file);
    formData.append("size", "auto");
    try {
        const response = await fetch("https://api.remove.bg/v1.0/removebg", {
            method: "POST",
            headers: { "X-Api-Key": REMOVE_BG_API_KEY },
            body: formData
        });
        return response.ok ? await response.blob() : file;
    } catch (e) { return file; }
}

async function resizeAndCrop(file, size = 200) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            const min = Math.min(img.width, img.height);
            const sx = (img.width - min) / 2;
            const sy = (img.height - min) / 4;
            ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
            canvas.toBlob(resolve, 'image/png', 0.9);
            URL.revokeObjectURL(url);
        };
        img.src = url;
    });
}

async function uploadToImgBB(file, isPhoto = false, shouldRemoveBg = false) {
    let fileToProcess = file;
    if (shouldRemoveBg) fileToProcess = await removeBackground(fileToProcess);
    const fileToUpload = isPhoto ? await resizeAndCrop(fileToProcess) : fileToProcess;
    const formData = new FormData();
    formData.append("image", fileToUpload);
    try {
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
        const result = await response.json();
        return result.success ? result.data.url : null;
    } catch(e) { return null; }
}

function cancelEditList() {
    editingType = null; editingIndex = null;
    document.getElementById('title-listes').innerText = "Ajouter une Liste (Campagne)";
    const btn = document.getElementById('btn-add-item');
    btn.innerText = "➕ Envoyer & Ajouter";
    btn.style.background = "#222";
    document.getElementById('btn-cancel-edit-list').style.display = "none";
    document.getElementById('type-liste').disabled = false;
    ['new-nom', 'new-prez', 'new-logo-file', 'new-insta', 'new-photo-coll-file'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = "";
    });
    document.getElementById('new-couleur').value = "#009EE3";
}

function startEditList(type, index) {
    const item = currentData[type][index];
    if (!item) return;
    editingType = type; editingIndex = index;
    document.getElementById('type-liste').value = type;
    document.getElementById('type-liste').disabled = true;
    document.getElementById('new-nom').value = item.nom || "";
    document.getElementById('new-prez').value = item.prez || "";
    document.getElementById('new-couleur').value = item.couleur || "#009EE3";
    document.getElementById('new-insta').value = item.insta || "";
    document.getElementById('title-listes').innerText = `✏️ Modif. : ${item.nom}`;
    const btn = document.getElementById('btn-add-item');
    btn.innerText = "💾 Enregistrer les modifications";
    btn.style.background = "var(--poly-cyan)";
    document.getElementById('btn-cancel-edit-list').style.display = "block";
    document.getElementById('card-listes').scrollIntoView({ behavior: 'smooth' });
}

async function saveAll() {
    const ecole = document.getElementById('ecole-select').value;
    const annee = document.getElementById('annee-select').value;
    try {
        await setDoc(doc(db, "ecoles", ecole, "archives", annee), currentData);
        renderExistingLists();
        document.getElementById('status').innerText = "✅ Données synchronisées !";
    } catch (e) { alert("Erreur : " + e.message); }
}

function renderExistingLists() {
    const container = document.getElementById('existing-lists-container');
    if (!container) return;
    let html = '';
    const categories = [{ key: 'listes_bde', label: 'Listes BDE' }, { key: 'listes_bdp', label: 'Listes BDP' }, { key: 'fakelistes', label: 'Fakelistes' }];
    let hasLists = false;
    categories.forEach(cat => {
        const items = currentData[cat.key] || [];
        if (items.length > 0) {
            hasLists = true;
            html += `<h4 style="color: #009EE3; margin: 20px 0 10px 0; font-size: 0.9em; text-transform: uppercase; border-bottom: 1px solid #333;">${cat.label}</h4>`;
            items.forEach((item, index) => {
                html += `
                    <div class="existing-item">
                        <img src="${item.logo || 'default.png'}">
                        <div class="existing-info">
                            <span class="existing-name">${item.nom || "Sans nom"}</span>
                            <span class="existing-prez">Prez: ${item.prez || "-"}</span>
                        </div>
                        <div class="action-group">
                            <input type="text" class="rank-input" placeholder="Rang" value="${item.classement || ''}" 
                                   data-type="${cat.key}" data-index="${index}" style="width: 50px; text-align:center; padding: 5px; height: 30px;">
                            <button class="btn-action btn-edit-list" data-type="${cat.key}" data-index="${index}">✏️</button>
                            <button class="btn-action btn-delete-list" data-type="${cat.key}" data-index="${index}">🗑️</button>
                        </div>
                    </div>`;
            });
        }
    });
    if (!hasLists) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">Aucune liste enregistrée.</p>';
    } else {
        html += `<button class="btn-push" id="btn-save-ranks" style="background: #28a745; margin-top:20px;">🏆 Sauvegarder les classements</button>`;
        container.innerHTML = html;
        document.querySelectorAll('.btn-edit-list').forEach(btn => btn.onclick = () => startEditList(btn.dataset.type, parseInt(btn.dataset.index)));
        document.querySelectorAll('.btn-delete-list').forEach(btn => btn.onclick = () => {
            if(confirm("Supprimer cette liste ?")) {
                currentData[btn.dataset.type].splice(parseInt(btn.dataset.index), 1);
                saveAll();
            }
        });
        document.getElementById('btn-save-ranks').onclick = () => {
            document.querySelectorAll('.rank-input').forEach(input => {
                const type = input.dataset.type;
                const idx = parseInt(input.dataset.index);
                currentData[type][idx].classement = input.value.trim();
            });
            saveAll();
        };
    }
}

async function loadArchive() {
    cancelEditList();
    const ecole = document.getElementById('ecole-select').value;
    const annee = document.getElementById('annee-select').value;
    const status = document.getElementById('status');
    try {
        const snap = await getDoc(doc(db, "ecoles", ecole, "archives", annee));
        currentData = {
            bde_actuel: { prez: "", photo: "", insta: "", photo_coll: "" },
            bdp_actuel: { prez: "", photo: "", insta: "", photo_coll: "" },
            listes_bde: [], listes_bdp: [], fakelistes: [],
            campagne_start: null, campagne_end: null, passation_date: null
        };
        if (snap.exists()) {
            currentData = { ...currentData, ...snap.data() };
            document.getElementById('bde-prez').value = currentData.bde_actuel?.prez || "";
            document.getElementById('bdp-prez').value = currentData.bdp_actuel?.prez || "";
            document.getElementById('bde-vp').value = currentData.bde_actuel?.vp || "";
            document.getElementById('bde-rr').value = currentData.bde_actuel?.rr || "";
            document.getElementById('bde-insta').value = currentData.bde_actuel?.insta || "";
            document.getElementById('bdp-insta').value = currentData.bdp_actuel?.insta || "";
            const formatDate = (val) => {
                if (!val) return "";
                try {
                    let d;
                    if (val.toDate) d = val.toDate();
                    else if (val.seconds) d = new Date(val.seconds * 1000);
                    else d = new Date(val);
                    return isNaN(d.getTime()) ? "" : d.toISOString().split('T')[0];
                } catch(err) { return ""; }
            };
            document.getElementById('date-debut-campagne').value = formatDate(currentData.campagne_start);
            document.getElementById('date-fin-campagne').value = formatDate(currentData.campagne_end);
            document.getElementById('date-passation').value = formatDate(currentData.passation_date);
            status.innerText = `✅ Données "${ecole}" chargées.`;
        } else {
            status.innerText = "Nouvelle archive vide.";
            ['bde-prez', 'bde-vp', 'bde-rr', 'bdp-prez', 'bde-insta', 'bdp-insta', 'date-debut-campagne', 'date-fin-campagne', 'date-passation'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.value = "";
            });
        } // ✅ ACCOLADE AJOUTÉE ICI

        renderExistingLists(); // On appelle cette fonction que l'archive existe ou non
    } catch(e) { 
        status.innerText = "Erreur de chargement."; 
    }
}

export function initAjoutListe(userData) {
    const schoolSelect = document.getElementById('ecole-select');
    
    // FILTRAGE : Si l'utilisateur n'est pas admin total, on limite ses écoles
    if (userData && userData.role !== 'admin') {
        const allowed = Array.isArray(userData.ecole) ? userData.ecole : [userData.ecole];
        Array.from(schoolSelect.options).forEach(opt => {
            if (opt.value && !allowed.includes(opt.value)) opt.remove();
        });
    }

    schoolSelect.onchange = loadArchive;
    document.getElementById('annee-select').onchange = loadArchive;
    loadArchive();

    document.getElementById('btn-save-officiels').onclick = async () => {
        const btn = document.getElementById('btn-save-officiels');
        btn.disabled = true; btn.innerText = "⏳ Sauvegarde...";
        const filesMap = [
            { id: 'bde-photo-file', key: 'photo', target: currentData.bde_actuel, sq: true, rb: 'bde-remove-bg' },
            { id: 'bdp-photo-file', key: 'photo', target: currentData.bdp_actuel, sq: true, rb: 'bdp-remove-bg' },
            { id: 'bde-photo-coll-file', key: 'photo_coll', target: currentData.bde_actuel, sq: false, rb: null },
            { id: 'bdp-photo-coll-file', key: 'photo_coll', target: currentData.bdp_actuel, sq: false, rb: null }
        ];
        for (const item of filesMap) {
            const file = document.getElementById(item.id)?.files[0];
            const rbChecked = item.rb ? document.getElementById(item.rb)?.checked : false;
            if (file) {
                const url = await uploadToImgBB(file, item.sq, rbChecked);
                if (url) item.target[item.key] = url;
            }
        }
        currentData.bde_actuel.prez = document.getElementById('bde-prez').value || "";
        currentData.bdp_actuel.prez = document.getElementById('bdp-prez').value || "";
        currentData.bde_actuel.insta = document.getElementById('bde-insta').value || "";
        currentData.bdp_actuel.insta = document.getElementById('bdp-insta').value || "";
        currentData.bde_actuel.vp = document.getElementById('bde-vp').value || "";
        currentData.bde_actuel.rr = document.getElementById('bde-rr').value || "";
        const dStart = document.getElementById('date-debut-campagne').value;
        const dEnd = document.getElementById('date-fin-campagne').value;
        const dPass = document.getElementById('date-passation').value;
        currentData.campagne_start = dStart ? Timestamp.fromDate(new Date(dStart + "T12:00:00")) : null;
        currentData.campagne_end = dEnd ? Timestamp.fromDate(new Date(dEnd + "T12:00:00")) : null;
        currentData.passation_date = dPass ? Timestamp.fromDate(new Date(dPass + "T12:00:00")) : null;
        await saveAll();
        btn.disabled = false; btn.innerText = "💾 Sauvegarder Infos & Dates";
    };

    document.getElementById('btn-add-item').onclick = async () => {
        const btn = document.getElementById('btn-add-item');
        const type = document.getElementById('type-liste').value;
        const nom = document.getElementById('new-nom').value.trim();
        const prez = document.getElementById('new-prez').value.trim();
        const fileLogo = document.getElementById('new-logo-file').files[0];
        const fileColl = document.getElementById('new-photo-coll-file').files[0];
        const rbLogo = document.getElementById('list-remove-bg')?.checked;
        if (!nom) return alert("Nom requis !");
        btn.disabled = true; btn.innerText = "⏳ Envoi...";
        let finalLogo = editingType !== null ? (currentData[editingType][editingIndex].logo || "") : "";
        let finalColl = editingType !== null ? (currentData[editingType][editingIndex].photo_coll || "") : "";
        let finalRank = editingType !== null ? (currentData[editingType][editingIndex].classement || "") : "";
        if (fileLogo) finalLogo = await uploadToImgBB(fileLogo, true, rbLogo);
        if (fileColl) finalColl = await uploadToImgBB(fileColl, false, false);
        const listObj = { nom, prez, logo: finalLogo, couleur: document.getElementById('new-couleur').value || "#009EE3", insta: document.getElementById('new-insta').value.trim() || "", photo_coll: finalColl, classement: finalRank };
        if (editingType !== null) currentData[editingType][editingIndex] = listObj;
        else {
            if (!fileLogo) { alert("Logo requis !"); btn.disabled = false; return; }
            currentData[type].push(listObj);
        }
        await saveAll(); cancelEditList(); btn.disabled = false;
    };
    document.getElementById('btn-cancel-edit-list').onclick = cancelEditList;
}
