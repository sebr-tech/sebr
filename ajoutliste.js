import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore, doc, getDoc, setDoc, Timestamp,
    collection, addDoc, serverTimestamp, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

let currentData = {
    bde_actuel: { prez: "", vp: "", rr: "", photo: "", insta: "", photo_coll: "" },
    bdp_actuel: { prez: "", photo: "", insta: "", photo_coll: "" },
    listes_bde: [], listes_bdp: [], fakelistes: [],
    campagne_start: null, campagne_end: null, passation_date: null
};

let editingType  = null;
let editingIndex = null;
let _userData    = null; // stocké à l'init

/* ══════════ HELPERS ══════════ */
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

/* ══════════ PROPOSITION ══════════ */
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

    // Incrémente le compteur de propositions
    await updateDoc(userRef, { proposalsCount: increment(1) });

    const remaining = MAX_PROPOSALS - count - 1;
    showStatus(`📤 Proposition envoyée ! Elle sera validée par un éditeur. Il vous reste ${remaining} proposition(s).`);
    updateProposalCounter(count + 1);
}

function updateProposalCounter(count) {
    const el = document.getElementById('proposal-counter');
    if (el) {
        el.textContent = `${MAX_PROPOSALS - count} proposition(s) restante(s)`;
        el.style.color = count >= MAX_PROPOSALS ? '#ed1c24' : count >= 7 ? '#f09433' : '#28a745';
    }
}

/* ══════════ UTILS IMAGES ══════════ */
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
    document.getElementById('title-listes').innerText = isUser() ? "Proposer une Fakeliste" : "Ajouter une Liste (Campagne)";
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

/* ══════════ SYNC FIRESTORE (admin/editor uniquement) ══════════ */
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
        alert("Erreur critique : " + e.message);
    } finally {
        if (btnSave) { btnSave.disabled = false; btnSave.innerText = "💾 Sauvegarder Infos & Dates"; }
        if (btnAdd)  { btnAdd.disabled  = false; btnAdd.innerText  = "➕ Envoyer & Ajouter"; }
    }
}

/* ══════════ RENDU LISTES EXISTANTES ══════════ */
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
        // Les USERs ne voient que les fakelistes (peuvent proposer modif)
        if (isUser() && cat.key !== 'fakelistes') return;
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
                                       data-type="${cat.key}" data-index="${index}" style="width:50px; text-align:center; padding:5px; height:30px;">
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
                btn.disabled = true; btn.innerText = "⌛ Mise à jour...";
                try {
                    document.querySelectorAll('.rank-input').forEach(input => {
                        const type = input.dataset.type;
                        const idx  = parseInt(input.dataset.index);
                        if (currentData[type]?.[idx]) currentData[type][idx].classement = input.value.trim();
                    });
                    await saveAll();
                    showStatus("🏆 Classements sauvegardés !");
                } catch(err) { showStatus("❌ Erreur", true); }
                finally { btn.disabled = false; btn.innerText = "🏆 Sauvegarder les classements"; }
            });
        }
    }
}

/* ══════════ CHARGEMENT ARCHIVE ══════════ */
async function loadArchive() {
    cancelEditList();
    const adminCards = document.querySelectorAll('.admin-card');
    adminCards.forEach(card => {
        card.querySelectorAll('input').forEach(input => {
            if (input.type === 'file') {
                const newInput = input.cloneNode(true);
                newInput.value = "";
                input.parentNode.replaceChild(newInput, input);
            } else if (input.type === 'checkbox') {
                input.checked = false;
            } else if (input.type === 'color') {
                input.value = "#009EE3";
            } else {
                input.value = "";
            }
        });
    });

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

            // Remplissage des champs (même pour les USERs, en lecture)
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

            if (status) { status.innerText = `✅ Données "${ecole}" chargées.`; status.style.color = "#28a745"; }
        } else {
            if (status) { status.innerText = "✨ Nouvelle archive vide pour cette sélection."; status.style.color = "#aaa"; }
        }

        renderExistingLists();

    } catch(e) {
        console.error("Erreur loadArchive:", e);
        if (status) { status.innerText = "❌ Erreur lors du chargement des données."; status.style.color = "#ff4b2b"; }
    }
}

/* ══════════ ADAPTATION UI POUR LES USERS ══════════ */
function applyUserModeUI() {
    // Changer les libellés des boutons
    const btnSave = document.getElementById('btn-save-officiels');
    const btnAdd  = document.getElementById('btn-add-item');
    const cardListes = document.getElementById('card-listes');

    if (btnSave) {
        btnSave.innerText    = "📤 Proposer ces modifications";
        btnSave.style.background = "var(--poly-cyan)";
    }
    if (btnAdd) {
        btnAdd.innerText     = "📤 Soumettre une proposition";
        btnAdd.style.background = "var(--poly-cyan)";
        btnAdd.style.border  = "none";
    }

    // Titre de la carte listes
    const titleListes = document.getElementById('title-listes');
    if (titleListes) titleListes.innerText = "Proposer une Fakeliste";

    // Limiter le type de liste aux fakelistes uniquement pour les users
    const typeSelect = document.getElementById('type-liste');
    if (typeSelect) {
        Array.from(typeSelect.options).forEach(opt => {
            if (opt.value !== 'fakelistes') opt.style.display = 'none';
        });
        typeSelect.value = 'fakelistes';
    }

    // Compteur de propositions
    const counter = document.createElement('div');
    counter.id = 'proposal-counter';
    counter.style.cssText = 'text-align:center; font-size:0.85em; font-weight:bold; margin-top:10px; padding:8px; background:#0d1520; border-radius:6px; border:1px solid #222;';
    counter.textContent = `${MAX_PROPOSALS} proposition(s) restante(s)`;
    document.getElementById('status')?.insertAdjacentElement('beforebegin', counter);

    // Charger le compteur réel
    const user = auth.currentUser;
    if (user) {
        getDoc(doc(db, "users", user.email)).then(snap => {
            if (snap.exists()) updateProposalCounter(snap.data().proposalsCount || 0);
        });
    }

    // Rendre les champs BDE/BDP en lecture seule sauf pour les fakelistes
    // (les users peuvent proposer modifs BDE/BDP via le bouton dédié)
    // Les inputs restent éditables pour permettre de formuler la proposition
    const infoNote = document.createElement('p');
    infoNote.style.cssText = 'font-size:0.8em; color:#f09433; margin-top:-10px; margin-bottom:10px; text-align:center;';
    infoNote.textContent = '⚠️ En tant qu\'utilisateur, vos modifications seront soumises à validation avant publication.';
    document.querySelector('.admin-card')?.insertAdjacentElement('afterbegin', infoNote);
}

/* ══════════ INIT ══════════ */
export function initAjoutListe(userData) {
    _userData = userData;
    const schoolSelect = document.getElementById('ecole-select');

    // Restriction école pour les éditeurs
    if (userData && userData.role === 'editor') {
        const allowed = Array.isArray(userData.ecole) ? userData.ecole : [userData.ecole];
        Array.from(schoolSelect.options).forEach(opt => {
            if (opt.value && !allowed.includes(opt.value)) opt.remove();
        });
    }

    // Si USER : forcer son école et désactiver le sélecteur
    if (isUser()) {
        Array.from(schoolSelect.options).forEach(opt => {
            if (opt.value && opt.value !== userData.ecole) opt.remove();
        });
        schoolSelect.value    = userData.ecole;
        schoolSelect.disabled = true;
        applyUserModeUI();
    }

    schoolSelect.onchange = loadArchive;
    document.getElementById('annee-select').onchange = loadArchive;
    loadArchive();

    /* ── SAUVEGARDE OFFICIELS (admin/editor) OU PROPOSITION (user) ── */
    document.getElementById('btn-save-officiels').onclick = async () => {
        const btn = document.getElementById('btn-save-officiels');
        btn.disabled = true;
        btn.innerText = isUser() ? "⏳ Envoi..." : "⏳ Sauvegarde...";

        if (isUser()) {
            /* MODE USER : soumettre proposition */
            try {
                const bdePayload = {
                    prez: document.getElementById('bde-prez').value  || "",
                    vp:   document.getElementById('bde-vp').value    || "",
                    rr:   document.getElementById('bde-rr').value    || "",
                    insta: document.getElementById('bde-insta').value || ""
                };
                const bdpPayload = {
                    prez:  document.getElementById('bdp-prez').value  || "",
                    insta: document.getElementById('bdp-insta').value || ""
                };

                const dStart = document.getElementById('date-debut-campagne').value;
                const dEnd   = document.getElementById('date-fin-campagne').value;
                const dPass  = document.getElementById('date-passation').value;

                // On ne soumet que si des champs ont été modifiés
                const hasBdeChanges = Object.values(bdePayload).some(v => v);
                const hasBdpChanges = Object.values(bdpPayload).some(v => v);
                const hasDates      = dStart || dEnd || dPass;

                if (hasBdeChanges) await submitProposal('bde_info', bdePayload);
                if (hasBdpChanges) await submitProposal('bdp_info', bdpPayload);
                if (hasDates) await submitProposal('dates', {
                    campagne_start: dStart ? Timestamp.fromDate(new Date(dStart + "T12:00:00")) : null,
                    campagne_end:   dEnd   ? Timestamp.fromDate(new Date(dEnd   + "T12:00:00")) : null,
                    passation_date: dPass  ? Timestamp.fromDate(new Date(dPass  + "T12:00:00")) : null,
                });

                if (!hasBdeChanges && !hasBdpChanges && !hasDates) {
                    showStatus("⚠️ Aucune modification détectée.", true);
                }

            } catch (e) {
                showStatus("❌ " + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerText = "📤 Proposer ces modifications";
            }
            return;
        }

        /* MODE ADMIN/EDITOR : sauvegarde directe */
        const filesMap = [
            { id: 'bde-photo-file',      key: 'photo',      target: currentData.bde_actuel, sq: true,  rb: 'bde-remove-bg' },
            { id: 'bdp-photo-file',      key: 'photo',      target: currentData.bdp_actuel, sq: true,  rb: 'bdp-remove-bg' },
            { id: 'bde-photo-coll-file', key: 'photo_coll', target: currentData.bde_actuel, sq: false, rb: null },
            { id: 'bdp-photo-coll-file', key: 'photo_coll', target: currentData.bdp_actuel, sq: false, rb: null }
        ];

        let hasImageUpload = false;
        for (const item of filesMap) {
            const file     = document.getElementById(item.id)?.files[0];
            const rbChecked = item.rb ? document.getElementById(item.rb)?.checked : false;
            if (file) {
                hasImageUpload = true;
                const url = await uploadToImgBB(file, item.sq, rbChecked);
                if (url) item.target[item.key] = url;
            }
        }

        currentData.bde_actuel.prez  = document.getElementById('bde-prez').value || "";
        currentData.bde_actuel.vp    = document.getElementById('bde-vp').value   || "";
        currentData.bde_actuel.rr    = document.getElementById('bde-rr').value   || "";
        currentData.bde_actuel.insta = document.getElementById('bde-insta').value || "";
        currentData.bdp_actuel.prez  = document.getElementById('bdp-prez').value  || "";
        currentData.bdp_actuel.insta = document.getElementById('bdp-insta').value || "";

        const dStart = document.getElementById('date-debut-campagne').value;
        const dEnd   = document.getElementById('date-fin-campagne').value;
        const dPass  = document.getElementById('date-passation').value;

        currentData.campagne_start  = dStart ? Timestamp.fromDate(new Date(dStart + "T12:00:00")) : null;
        currentData.campagne_end    = dEnd   ? Timestamp.fromDate(new Date(dEnd   + "T12:00:00")) : null;
        currentData.passation_date  = dPass  ? Timestamp.fromDate(new Date(dPass  + "T12:00:00")) : null;

        await saveAll();

        if (hasImageUpload) {
            showStatus("✅ Sauvegardé ! Rechargement...");
            setTimeout(() => reloadAfterUpload(), 1200);
        } else {
            btn.disabled = false; btn.innerText = "💾 Sauvegarder Infos & Dates";
        }
    };

    /* ── AJOUT / MODIF LISTE ── */
    document.getElementById('btn-add-item').onclick = async () => {
        const btn  = document.getElementById('btn-add-item');
        const type = document.getElementById('type-liste').value;
        const nom  = document.getElementById('new-nom').value.trim();

        if (!nom) return showStatus("❌ Nom requis !", true);
        btn.disabled = true;
        btn.innerText = "⏳ Envoi en cours...";
        showStatus("⏳ Traitement des images...");

        try {
            const fileLogo = document.getElementById('new-logo-file').files[0];
            const fileColl = document.getElementById('new-photo-coll-file').files[0];
            const rbLogo   = document.getElementById('list-remove-bg')?.checked;

            let finalLogo = editingType !== null ? (currentData[editingType][editingIndex]?.logo || "") : "";
            let finalColl = editingType !== null ? (currentData[editingType][editingIndex]?.photo_coll || "") : "";
            let finalRank = editingType !== null ? (currentData[editingType][editingIndex]?.classement || "") : "";
            let hasImageUpload = false;

            if (fileLogo) {
                hasImageUpload = true;
                const url = await uploadToImgBB(fileLogo, true, rbLogo);
                if (url) finalLogo = url;
            }
            if (fileColl) {
                hasImageUpload = true;
                const url = await uploadToImgBB(fileColl, false, false);
                if (url) finalColl = url;
            }

            const listObj = {
                nom,
                prez:     document.getElementById('new-prez').value.trim(),
                logo:     finalLogo,
                couleur:  document.getElementById('new-couleur').value || "#009EE3",
                insta:    document.getElementById('new-insta').value.trim() || "",
                photo_coll: finalColl,
                classement: finalRank
            };

            if (isUser()) {
                /* MODE USER : soumettre proposition */
                let proposalType;
                if (editingType !== null) {
                    proposalType = editingType === 'fakelistes' ? 'fakeliste_edit'
                        : editingType === 'listes_bde' ? 'liste_bde_edit' : 'liste_bdp_edit';
                } else {
                    if (!finalLogo) throw new Error("Le logo est obligatoire pour une nouvelle fakeliste.");
                    proposalType = 'fakeliste_add';
                }
                await submitProposal(proposalType, listObj);
                cancelEditList();

            } else {
                /* MODE ADMIN/EDITOR : direct */
                if (editingType !== null) {
                    currentData[editingType][editingIndex] = listObj;
                } else {
                    if (!finalLogo) throw new Error("Le logo est obligatoire pour une nouvelle liste");
                    currentData[type].push(listObj);
                }
                await saveAll();

                if (hasImageUpload) {
                    showStatus("✅ Sauvegardé ! Rechargement...");
                    setTimeout(() => reloadAfterUpload(), 1200);
                } else {
                    cancelEditList();
                }
            }

        } catch (err) {
            showStatus("❌ " + err.message, true);
            btn.disabled = false;
            btn.innerText = isUser() ? "📤 Soumettre une proposition" : "💾 Réessayer";
            document.querySelectorAll('input[type="file"]').forEach(el => el.value = "");
        }
    };

    document.getElementById('btn-cancel-edit-list').onclick = cancelEditList;
}
