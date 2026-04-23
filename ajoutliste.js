import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore, doc, getDoc, setDoc, Timestamp,
    collection, addDoc, serverTimestamp, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* ══════════ CONFIGURATION ══════════ */
const firebaseConfig = {
    apiKey: "AIzaSyB1_SgV4E80Qxs2vQ-_jIGexv6YYqaiARs",
    authDomain: "sebr-dea8d.firebaseapp.com",
    projectId: "sebr-dea8d",
    storageBucket: "sebr-dea8d.firebasestorage.app",
    messagingSenderId: "948314281215",
    appId: "1:948314281215:web:1fddf38350d9a3663e68ca"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

const IMGBB_API_KEY    = "9d62b3a6a9d75ffdc8621c7eb58f1181";
const REMOVE_BG_API_KEY = "GzD4aRxmuijz2vhL7xAkrmy3";
const MAX_PROPOSALS    = 10;

/* ══════════ ETAT GLOBAL ══════════ */
let currentData = {
    bde_actuel: { prez: "", vp: "", rr: "", photo: "", insta: "", photo_coll: "" },
    bdp_actuel: { prez: "", photo: "", insta: "", photo_coll: "" },
    listes_bde: [], listes_bdp: [], fakelistes: [],
    campagne_start: null, campagne_end: null, passation_date: null
};

let editingType  = null;
let editingIndex = null;
let _userData    = null; 

/* ══════════ HELPERS UI ══════════ */
const isUser = () => _userData?.role === 'user';

function showStatus(message, isError = false) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.innerText      = message;
        statusEl.style.color    = isError ? "#ff4b2b" : "#28a745";
        if (!isError) setTimeout(() => { if(statusEl) statusEl.style.color = ""; }, 5000);
    }
}

function reloadAfterUpload() {
    if ('caches' in window) caches.keys().then(names => names.forEach(n => caches.delete(n)));
    window.location.reload(true);
}

/* ══════════ SYSTÈME DE PROPOSITION ══════════ */
async function submitProposal(type, payload) {
    const user = auth.currentUser;
    if (!user) throw new Error("Non connecté.");

    const userRef  = doc(db, "users", user.email);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error("Utilisateur introuvable.");

    const userData  = userSnap.data();
    const count     = userData.proposalsCount || 0;

    if (count >= MAX_PROPOSALS) {
        throw new Error(`Vous avez atteint la limite de ${MAX_PROPOSALS} propositions.`);
    }

    const ecole = document.getElementById('ecole-select').value;
    const annee = document.getElementById('annee-select').value;

    await addDoc(collection(db, "proposals"), {
        authorEmail:  user.email,
        authorPrenom: userData.prenom || "",
        ecole,
        annee,
        type,
        payload,
        status:    "pending",
        createdAt: serverTimestamp()
    });

    await updateDoc(userRef, { proposalsCount: increment(1) });

    const remaining = MAX_PROPOSALS - count - 1;
    showStatus(`📤 Proposition envoyée ! Elle sera validée par un éditeur. Il reste ${remaining} proposition(s).`);
    updateProposalCounter(count + 1);
}

function updateProposalCounter(count) {
    const el = document.getElementById('proposal-counter');
    if (el) {
        el.textContent = `${MAX_PROPOSALS - count} proposition(s) restante(s)`;
        el.style.color = count >= MAX_PROPOSALS ? '#ed1c24' : count >= 7 ? '#f09433' : '#28a745';
    }
}

/* ══════════ UTILS IMAGES (RESIZING & API) ══════════ */
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

async function resizeAndCrop(file, size = 1000, forceSquare = false) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx    = canvas.getContext('2d');
            if (forceSquare) {
                canvas.width = size; canvas.height = size;
                const min = Math.min(img.width, img.height);
                const sx  = (img.width - min) / 2;
                const sy  = (img.height - min) / 4;
                ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
            } else {
                const ratio = img.width / img.height;
                const tw = img.width > size ? size : img.width;
                const th = img.width > size ? size / ratio : img.height;
                canvas.width = tw; canvas.height = th;
                ctx.drawImage(img, 0, 0, tw, th);
            }
            canvas.toBlob(resolve, 'image/jpeg', 0.95);
            URL.revokeObjectURL(url);
        };
        img.src = url;
    });
}

async function uploadToImgBB(file, isPhoto = false, shouldRemoveBg = false) {
    try {
        let fileToUpload = file;
        if (isPhoto) {
            let processed = file;
            if (shouldRemoveBg) processed = await removeBackground(processed);
            fileToUpload = await resizeAndCrop(processed, 300, true);
        }
        const formData = new FormData();
        formData.append("image", fileToUpload);
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
        const result   = await response.json();
        if (result.success) { showStatus("📸 Image uploadée !"); return result.data.url; }
        showStatus("❌ Erreur ImgBB : " + result.error.message, true); return null;
    } catch(e) { showStatus("❌ Erreur de connexion", true); return null; }
}

/* ══════════ GESTION DES LISTES (EDIT / CANCEL) ══════════ */
function cancelEditList() {
    editingType = null; editingIndex = null;
    document.getElementById('title-listes').innerText = isUser() ? "Proposer l'ajout d'une Liste" : "Ajouter une Liste (Campagne)";
    const btn = document.getElementById('btn-add-item');
    btn.innerText = isUser() ? "📤 Soumettre une proposition" : "➕ Envoyer & Ajouter";
    btn.style.background = isUser() ? "var(--poly-cyan)" : "#222";
    document.getElementById('btn-cancel-edit-list').style.display = "none";
    document.getElementById('type-liste').disabled = false;
    ['new-nom', 'new-prez', 'new-logo-file', 'new-insta', 'new-photo-coll-file'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    document.getElementById('new-couleur').value = "#009EE3";
}

function startEditList(type, index) {
    const item = currentData[type][index];
    if (!item) return;
    editingType = type; editingIndex = index;
    document.getElementById('type-liste').value          = type;
    document.getElementById('type-liste').disabled       = true;
    document.getElementById('new-nom').value             = item.nom    || "";
    document.getElementById('new-prez').value            = item.prez   || "";
    document.getElementById('new-couleur').value         = item.couleur || "#009EE3";
    document.getElementById('new-insta').value           = item.insta  || "";
    document.getElementById('title-listes').innerText    = isUser() ? `✏️ Proposer modif : ${item.nom}` : `✏️ Modif. : ${item.nom}`;
    const btn = document.getElementById('btn-add-item');
    btn.innerText = isUser() ? "📤 Soumettre la modification" : "💾 Enregistrer les modifications";
    btn.style.background = "var(--poly-cyan)";
    document.getElementById('btn-cancel-edit-list').style.display = "block";
    document.getElementById('card-listes').scrollIntoView({ behavior: 'smooth' });
}

/* ══════════ SYNC FIRESTORE ══════════ */
async function saveAll() {
    const ecole  = document.getElementById('ecole-select').value;
    const annee  = document.getElementById('annee-select').value;
    const btnSave = document.getElementById('btn-save-officiels');
    const btnAdd  = document.getElementById('btn-add-item');
    try {
        await setDoc(doc(db, "ecoles", ecole, "archives", annee), currentData);
        renderExistingLists();
        showStatus("✅ Données synchronisées avec succès !");
    } catch (e) {
        showStatus("❌ Erreur Firestore : " + e.message, true);
    } finally {
        if (btnSave) { btnSave.disabled = false; btnSave.innerText = "💾 Sauvegarder Infos & Dates"; }
        if (btnAdd)  { btnAdd.disabled  = false; btnAdd.innerText  = "➕ Envoyer & Ajouter"; }
    }
}

/* ══════════ RENDU DES LISTES ══════════ */
function renderExistingLists() {
    const container = document.getElementById('existing-lists-container');
    if (!container) return;
    let html = '';
    const categories = [
        { key: 'listes_bde', label: 'Listes BDE' },
        { key: 'listes_bdp', label: 'Listes BDP' },
        { key: 'fakelistes', label: 'Fakelistes' }
    ];
    let hasLists = false;
    categories.forEach(cat => {
        const items = currentData[cat.key] || [];
        if (items.length > 0) {
            hasLists = true;
            html += `<h4 style="color:#009EE3; margin:20px 0 10px 0; font-size:0.9em; text-transform:uppercase; border-bottom:1px solid #333;">${cat.label}</h4>`;
            items.forEach((item, index) => {
                html += `
                    <div class="existing-item">
                        <img src="${item.logo || 'default.png'}">
                        <div class="existing-info">
                            <span class="existing-name">${item.nom || "Sans nom"}</span>
                            <span class="existing-prez">Prez: ${item.prez || "-"}</span>
                        </div>
                        <div class="action-group">
                            ${!isUser() ? `
                                <input type="text" class="rank-input" placeholder="Rang" value="${item.classement || ''}" 
                                       data-type="${cat.key}" data-index="${index}" style="width:50px; text-align:center; padding:5px;">
                                <button class="btn-action btn-delete-list" data-type="${cat.key}" data-index="${index}">🗑️</button>
                            ` : ''}
                            <button class="btn-action btn-edit-list" data-type="${cat.key}" data-index="${index}">
                                ${isUser() ? '📤 Proposer modif' : '✏️'}
                            </button>
                        </div>
                    </div>`;
            });
        }
    });
    if (!hasLists) {
        container.innerHTML = '<p style="color:#666; text-align:center; padding:20px;">Aucune liste enregistrée.</p>';
    } else {
        if (!isUser()) {
            html += `<button class="btn-push" id="btn-save-ranks" style="background:#28a745; margin-top:20px;">🏆 Sauvegarder les classements</button>`;
        }
        container.innerHTML = html;
        document.querySelectorAll('.btn-edit-list').forEach(btn => btn.onclick = () => startEditList(btn.dataset.type, parseInt(btn.dataset.index)));
        if (!isUser()) {
            document.querySelectorAll('.btn-delete-list').forEach(btn => btn.onclick = () => {
                if (confirm("Supprimer cette liste ?")) {
                    currentData[btn.dataset.type].splice(parseInt(btn.dataset.index), 1);
                    saveAll();
                }
            });
            document.getElementById('btn-save-ranks')?.addEventListener('click', async () => {
                const btn = document.getElementById('btn-save-ranks');
                btn.disabled = true;
                document.querySelectorAll('.rank-input').forEach(input => {
                    const type = input.dataset.type;
                    const idx  = parseInt(input.dataset.index);
                    if (currentData[type]?.[idx]) currentData[type][idx].classement = input.value.trim();
                });
                await saveAll();
                btn.disabled = false;
            });
        }
    }
}

/* ══════════ CHARGEMENT DES ARCHIVES ══════════ */
async function loadArchive() {
    cancelEditList();
    const ecole  = document.getElementById('ecole-select').value;
    const annee  = document.getElementById('annee-select').value;
    const status = document.getElementById('status');

    try {
        const snap = await getDoc(doc(db, "ecoles", ecole, "archives", annee));
        currentData = {
            bde_actuel: { prez: "", vp: "", rr: "", photo: "", insta: "", photo_coll: "" },
            bdp_actuel: { prez: "", photo: "", insta: "", photo_coll: "" },
            listes_bde: [], listes_bdp: [], fakelistes: [],
            campagne_start: null, campagne_end: null, passation_date: null
        };

        if (snap.exists()) {
            const data = snap.data();
            currentData = { ...currentData, ...data };

            document.getElementById('bde-prez').value = currentData.bde_actuel.prez || "";
            document.getElementById('bde-vp').value   = currentData.bde_actuel.vp   || "";
            document.getElementById('bde-rr').value   = currentData.bde_actuel.rr   || "";
            document.getElementById('bde-insta').value = currentData.bde_actuel.insta || "";
            document.getElementById('bdp-prez').value  = currentData.bdp_actuel.prez  || "";
            document.getElementById('bdp-insta').value = currentData.bdp_actuel.insta || "";

            const formatDate = (val) => {
                if (!val) return "";
                let d = val.toDate ? val.toDate() : new Date(val.seconds * 1000 || val);
                return isNaN(d.getTime()) ? "" : d.toISOString().split('T')[0];
            };
            document.getElementById('date-debut-campagne').value = formatDate(currentData.campagne_start);
            document.getElementById('date-fin-campagne').value   = formatDate(currentData.campagne_end);
            document.getElementById('date-passation').value      = formatDate(currentData.passation_date);
            if (status) status.innerText = `✅ Données chargées.`;
        }
        renderExistingLists();
    } catch(e) {
        if (status) status.innerText = "❌ Erreur chargement.";
    }
}

/* ══════════ ADAPTATION UI ══════════ */
function applyUserModeUI() {
    const btnSave = document.getElementById('btn-save-officiels');
    const btnAdd  = document.getElementById('btn-add-item');

    if (btnSave) btnSave.innerText = "📤 Proposer ces modifications";
    if (btnAdd) btnAdd.innerText = "📤 Soumettre une proposition";

    if (!document.getElementById('proposal-counter')) {
        const counter = document.createElement('div');
        counter.id = 'proposal-counter';
        counter.style.cssText = 'text-align:center; font-size:0.85em; font-weight:bold; margin-top:10px; padding:8px; background:#0d1520; border-radius:6px;';
        counter.textContent = `${MAX_PROPOSALS} proposition(s) restante(s)`;
        document.getElementById('status')?.insertAdjacentElement('beforebegin', counter);
    }

    const user = auth.currentUser;
    if (user) {
        getDoc(doc(db, "users", user.email)).then(snap => {
            if (snap.exists()) updateProposalCounter(snap.data().proposalsCount || 0);
        });
    }
}

/* ══════════ INITIALISATION PRINCIPALE ══════════ */
export function initAjoutListe(userData) {
    _userData = userData;
    const schoolSelect = document.getElementById('ecole-select');

    if (userData && userData.role === 'editor') {
        const allowed = Array.isArray(userData.ecole) ? userData.ecole : [userData.ecole];
        Array.from(schoolSelect.options).forEach(opt => {
            if (opt.value && !allowed.includes(opt.value)) opt.remove();
        });
    }

    if (isUser()) {
        Array.from(schoolSelect.options).forEach(opt => {
            if (opt.value && opt.value !== userData.ecole) opt.remove();
        });
        schoolSelect.value = userData.ecole;
        schoolSelect.disabled = true;
        applyUserModeUI();
    }

    schoolSelect.onchange = loadArchive;
    document.getElementById('annee-select').onchange = loadArchive;
    loadArchive();

    // CLIC SAUVEGARDE (BUREAUX ET DATES)
    document.getElementById('btn-save-officiels').onclick = async () => {
        const btn = document.getElementById('btn-save-officiels');
        btn.disabled = true;
        btn.innerText = "⏳ Traitement...";

        const filesMap = [
            { id: 'bde-photo-file', key: 'photo', target: 'bde', sq: true, rb: 'bde-remove-bg' },
            { id: 'bdp-photo-file', key: 'photo', target: 'bdp', sq: true, rb: 'bdp-remove-bg' },
            { id: 'bde-photo-coll-file', key: 'photo_coll', target: 'bde', sq: false },
            { id: 'bdp-photo-coll-file', key: 'photo_coll', target: 'bdp', sq: false }
        ];

        let uploadedFiles = { bde: {}, bdp: {} };
        let hasImage = false;

        try {
            for (const item of filesMap) {
                const file = document.getElementById(item.id)?.files[0];
                const rb = item.rb ? document.getElementById(item.rb)?.checked : false;
                if (file) {
                    hasImage = true;
                    const url = await uploadToImgBB(file, item.sq, rb);
                    if (url) uploadedFiles[item.target][item.key] = url;
                }
            }

            const dStart = document.getElementById('date-debut-campagne').value;
            const dEnd   = document.getElementById('date-fin-campagne').value;
            const dPass  = document.getElementById('date-passation').value;

            if (isUser()) {
                // --- 1. Vérification BDE ---
                const oldBde = currentData.bde_actuel || {};
                const newBde = {
                    prez: document.getElementById('bde-prez').value.trim(),
                    vp: document.getElementById('bde-vp').value.trim(),
                    rr: document.getElementById('bde-rr').value.trim(),
                    insta: document.getElementById('bde-insta').value.trim()
                };

                // On check si le texte a changé OU si une nouvelle photo a été uploadée
                const bdeChanged = (newBde.prez !== oldBde.prez) || (newBde.vp !== oldBde.vp) || 
                                   (newBde.rr !== oldBde.rr) || (newBde.insta !== oldBde.insta) ||
                                   uploadedFiles.bde.photo || uploadedFiles.bde.photo_coll;

                if (bdeChanged) {
                    await submitProposal('bde_info', { ...uploadedFiles.bde, ...newBde });
                }

                // --- 2. Vérification BDP ---
                const oldBdp = currentData.bdp_actuel || {};
                const newBdp = {
                    prez: document.getElementById('bdp-prez').value.trim(),
                    insta: document.getElementById('bdp-insta').value.trim()
                };

                const bdpChanged = (newBdp.prez !== oldBdp.prez) || (newBdp.insta !== oldBdp.insta) ||
                                   uploadedFiles.bdp.photo || uploadedFiles.bdp.photo_coll;

                if (bdpChanged) {
                    await submitProposal('bdp_info', { ...uploadedFiles.bdp, ...newBdp });
                }

                // --- 3. Vérification DATES ---
                // Fonction helper pour comparer les dates (YYYY-MM-DD)
                const getOldDate = (ts) => ts ? (ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000)).toISOString().split('T')[0] : "";
                
                const datesChanged = dStart !== getOldDate(currentData.campagne_start) ||
                                     dEnd   !== getOldDate(currentData.campagne_end) ||
                                     dPass  !== getOldDate(currentData.passation_date);

                if (datesChanged) {
                    await submitProposal('dates', {
                        campagne_start: dStart ? Timestamp.fromDate(new Date(dStart + "T12:00:00")) : null,
                        campagne_end: dEnd ? Timestamp.fromDate(new Date(dEnd + "T12:00:00")) : null,
                        passation_date: dPass ? Timestamp.fromDate(new Date(dPass + "T12:00:00")) : null
                    });
                }
                
                if (!bdeChanged && !bdpChanged && !datesChanged) {
                    showStatus("ℹ️ Aucune modification détectée.", false);
                }

            } else {
                // LE RESTE DU CODE (ELSE) POUR L'ADMIN NE CHANGE PAS
                Object.assign(currentData.bde_actuel, uploadedFiles.bde);
                // ... (garde ton code existant ici pour la sauvegarde directe admin)
                await saveAll();
            }

    // CLIC AJOUT/MODIF LISTE
    document.getElementById('btn-add-item').onclick = async () => {
        const btn = document.getElementById('btn-add-item');
        const type = document.getElementById('type-liste').value;
        const nom = document.getElementById('new-nom').value.trim();
        if (!nom) return showStatus("❌ Nom requis !", true);

        btn.disabled = true;
        try {
            const fileLogo = document.getElementById('new-logo-file').files[0];
            const fileColl = document.getElementById('new-photo-coll-file').files[0];
            const rbLogo = document.getElementById('list-remove-bg')?.checked;

            let finalLogo = editingType !== null ? currentData[editingType][editingIndex].logo : "";
            let finalColl = editingType !== null ? currentData[editingType][editingIndex].photo_coll : "";

            if (fileLogo) finalLogo = await uploadToImgBB(fileLogo, true, rbLogo);
            if (fileColl) finalColl = await uploadToImgBB(fileColl, false, false);

            const listObj = {
                nom,
                prez: document.getElementById('new-prez').value.trim(),
                logo: finalLogo,
                couleur: document.getElementById('new-couleur').value,
                insta: document.getElementById('new-insta').value.trim(),
                photo_coll: finalColl,
                classement: editingType !== null ? currentData[editingType][editingIndex].classement : ""
            };

            if (isUser()) {
                let pType = editingType !== null ? (editingType === 'fakelistes' ? 'fakeliste_edit' : editingType === 'listes_bde' ? 'liste_bde_edit' : 'liste_bdp_edit') 
                                                : (type === 'fakelistes' ? 'fakeliste_add' : type === 'listes_bde' ? 'liste_bde_add' : 'liste_bdp_add');
                await submitProposal(pType, listObj);
                cancelEditList();
            } else {
                if (editingType !== null) currentData[editingType][editingIndex] = listObj;
                else currentData[type].push(listObj);
                await saveAll();
                cancelEditList();
            }
        } catch (e) { showStatus("❌ " + e.message, true); }
        finally { btn.disabled = false; }
    };

    document.getElementById('btn-cancel-edit-list').onclick = cancelEditList;
}
