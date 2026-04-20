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

// --- STRUCTURE INITIALE (CORRIGÉE AVEC VP ET RR) ---
let currentData = {
    bde_actuel: { prez: "", vp: "", rr: "", photo: "", insta: "", photo_coll: "" },
    bdp_actuel: { prez: "", photo: "", insta: "", photo_coll: "" },
    listes_bde: [], listes_bdp: [], fakelistes: [],
    campagne_start: null, campagne_end: null, passation_date: null
};

let editingType = null;
let editingIndex = null;

function showStatus(message, isError = false) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.innerText = message;
        statusEl.style.color = isError ? "#ff4b2b" : "#28a745";
        
        // Optionnel : remet le message en blanc/gris après 5 secondes si c'est un succès
        if (!isError) {
            setTimeout(() => { statusEl.style.color = ""; }, 5000);
        }
    }
}

// --- UTILS IMAGES ---
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
            const ctx = canvas.getContext('2d');

            let targetWidth, targetHeight;

            if (forceSquare) {
                // Logique de rognage carré (pour les logos/portraits)
                targetWidth = size;
                targetHeight = size;
                canvas.width = size;
                canvas.height = size;
                const min = Math.min(img.width, img.height);
                const sx = (img.width - min) / 2;
                const sy = (img.height - min) / 4;
                ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
            } else {
                // Logique de redimensionnement proportionnel (pour les photos de groupe)
                const ratio = img.width / img.height;
                if (img.width > size) {
                    targetWidth = size;
                    targetHeight = size / ratio;
                } else {
                    targetWidth = img.width;
                    targetHeight = img.height;
                }
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            }

            // On augmente la qualité à 0.95 pour éviter le flou
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
            // Uniquement pour les portraits/logos : on traite l'image
            let processedFile = file;
            if (shouldRemoveBg) processedFile = await removeBackground(processedFile);
            fileToUpload = await resizeAndCrop(processedFile, 300, true);
        } 
        // Si isPhoto est false (cas des photos collectives), 
        // on ne touche à rien, fileToUpload reste le "file" d'origine.

        const formData = new FormData();
        formData.append("image", fileToUpload);

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { 
            method: "POST", 
            body: formData 
        });
        
        const result = await response.json();
        if (result.success) {
            showStatus("📸 Image uploadée avec succès !");
            return result.data.url;
        } else {
            showStatus("❌ Erreur ImgBB : " + result.error.message, true);
            return null;
        }
    } catch(e) { 
        showStatus("❌ Erreur de connexion", true);
        return null; 
    }
}

// --- GESTION DES LISTES (EDIT / CANCEL) ---
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

// --- SYNC FIRESTORE ---
async function saveAll() {
    const ecole = document.getElementById('ecole-select').value;
    const annee = document.getElementById('annee-select').value;
    const btnSave = document.getElementById('btn-save-officiels');
    const btnAdd = document.getElementById('btn-add-item');

    try {
        await setDoc(doc(db, "ecoles", ecole, "archives", annee), currentData);
        renderExistingLists();
        showStatus("✅ Données synchronisées avec succès !");
    } catch (e) { 
        showStatus("❌ Erreur Firestore : " + e.message, true);
        alert("Erreur critique : " + e.message);
    } finally {
        // On s'assure de débloquer les boutons quoi qu'il arrive
        if (btnSave) { btnSave.disabled = false; btnSave.innerText = "💾 Sauvegarder Infos & Dates"; }
        if (btnAdd) { btnAdd.disabled = false; btnAdd.innerText = "➕ Envoyer & Ajouter"; }
    }
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
        document.getElementById('btn-save-ranks').onclick = async () => {
            const btn = document.getElementById('btn-save-ranks');
            
            // 1. Verrouiller le bouton pour éviter les doubles clics
            btn.disabled = true;
            btn.innerText = "⌛ Mise à jour...";
        
            try {
                // 2. Récupérer les valeurs des inputs de rang
                document.querySelectorAll('.rank-input').forEach(input => {
                    const type = input.dataset.type;
                    const idx = parseInt(input.dataset.index);
                    
                    // Sécurité : on vérifie que l'index existe toujours dans currentData
                    if (currentData[type] && currentData[type][idx]) {
                        currentData[type][idx].classement = input.value.trim();
                    }
                });
        
                // 3. Envoyer le tout à Firestore
                await saveAll(); 
                
                showStatus("🏆 Classements sauvegardés avec succès !");
            } catch (error) {
                console.error("Erreur rangs:", error);
                showStatus("❌ Erreur lors de la sauvegarde des rangs", true);
            } finally {
                // 4. Redonner la main à l'utilisateur
                btn.disabled = false;
                btn.innerText = "🏆 Sauvegarder les classements";
            }
        };
    }
}

async function loadArchive() {
    cancelEditList();

    // 1. VIDAGE PHYSIQUE DES INPUTS
    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.value = ""; 
    });

    // 2. VIDAGE DES PRÉVISUALISATIONS (si tu en as dans ton HTML)
    // Ajoute des classes 'img-preview' à tes balises <img> pour que ça marche
    document.querySelectorAll('.img-preview').forEach(img => {
        img.src = "default.png"; // ou ""
    });

    const ecole = document.getElementById('ecole-select').value;
    const annee = document.getElementById('annee-select').value;
    const status = document.getElementById('status');

    try {
        const snap = await getDoc(doc(db, "ecoles", ecole, "archives", annee));
        
        // 3. RESET TOTAL DE L'OBJET (On ne fait plus de merge avec l'ancien)
        currentData = {
            bde_actuel: { prez: "", vp: "", rr: "", photo: "", insta: "", photo_coll: "" },
            bdp_actuel: { prez: "", photo: "", insta: "", photo_coll: "" },
            listes_bde: [], listes_bdp: [], fakelistes: [],
            campagne_start: null, campagne_end: null, passation_date: null
        };

        if (snap.exists()) {
            const data = snap.data();
            // On remplit uniquement avec ce qui existe en base
            currentData = {
                ...currentData,
                ...data,
                bde_actuel: { ...currentData.bde_actuel, ...(data.bde_actuel || {}) },
                bdp_actuel: { ...currentData.bdp_actuel, ...(data.bdp_actuel || {}) }
            };

            // Remplissage des champs BDE / BDP
            document.getElementById('bde-prez').value = currentData.bde_actuel.prez || "";
            document.getElementById('bde-vp').value = currentData.bde_actuel.vp || "";
            document.getElementById('bde-rr').value = currentData.bde_actuel.rr || "";
            document.getElementById('bde-insta').value = currentData.bde_actuel.insta || "";
            
            document.getElementById('bdp-prez').value = currentData.bdp_actuel.prez || "";
            document.getElementById('bdp-insta').value = currentData.bdp_actuel.insta || "";

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
        }
        renderExistingLists();
    } catch(e) { 
        console.error(e);
        status.innerText = "Erreur de chargement."; 
    }
}

// --- INITIALISATION DU MODULE ---
export function initAjoutListe(userData) {
    const schoolSelect = document.getElementById('ecole-select');
    
    if (userData && userData.role !== 'admin') {
        const allowed = Array.isArray(userData.ecole) ? userData.ecole : [userData.ecole];
        Array.from(schoolSelect.options).forEach(opt => {
            if (opt.value && !allowed.includes(opt.value)) opt.remove();
        });
    }

    schoolSelect.onchange = loadArchive;
    document.getElementById('annee-select').onchange = loadArchive;
    loadArchive();

    // SAUVEGARDE DES INFOS OFFICIELLES (BDE / BDP)
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

        // --- CAPTURE DES VALEURS (VP ET RR INCLUS) ---
        currentData.bde_actuel.prez = document.getElementById('bde-prez').value || "";
        currentData.bde_actuel.vp = document.getElementById('bde-vp').value || "";
        currentData.bde_actuel.rr = document.getElementById('bde-rr').value || "";
        currentData.bde_actuel.insta = document.getElementById('bde-insta').value || "";

        currentData.bdp_actuel.prez = document.getElementById('bdp-prez').value || "";
        currentData.bdp_actuel.insta = document.getElementById('bdp-insta').value || "";

        const dStart = document.getElementById('date-debut-campagne').value;
        const dEnd = document.getElementById('date-fin-campagne').value;
        const dPass = document.getElementById('date-passation').value;
        
        currentData.campagne_start = dStart ? Timestamp.fromDate(new Date(dStart + "T12:00:00")) : null;
        currentData.campagne_end = dEnd ? Timestamp.fromDate(new Date(dEnd + "T12:00:00")) : null;
        currentData.passation_date = dPass ? Timestamp.fromDate(new Date(dPass + "T12:00:00")) : null;

        await saveAll();
        btn.disabled = false; btn.innerText = "💾 Sauvegarder Infos & Dates";
    };

    // AJOUT / MODIF D'UNE LISTE
    document.getElementById('btn-add-item').onclick = async () => {
        const btn = document.getElementById('btn-add-item');
        const type = document.getElementById('type-liste').value;
        const nom = document.getElementById('new-nom').value.trim();
        
        if (!nom) return showStatus("❌ Nom requis !", true);
        
        btn.disabled = true; 
        btn.innerText = "⏳ Envoi en cours...";
        showStatus("⏳ Traitement des images...");
    
        try {
            let finalLogo = editingType !== null ? (currentData[editingType][editingIndex].logo || "") : "";
            let finalColl = editingType !== null ? (currentData[editingType][editingIndex].photo_coll || "") : "";
            let finalRank = editingType !== null ? (currentData[editingType][editingIndex].classement || "") : "";
    
            const fileLogo = document.getElementById('new-logo-file').files[0];
            const fileColl = document.getElementById('new-photo-coll-file').files[0];
            const rbLogo = document.getElementById('list-remove-bg')?.checked;
    
            if (fileLogo) {
                const url = await uploadToImgBB(fileLogo, true, rbLogo);
                if (url) finalLogo = url;
            }
            
            if (fileColl) {
                const url = await uploadToImgBB(fileColl, false, false);
                if (url) finalColl = url;
            }
    
            const listObj = { 
                nom, prez: document.getElementById('new-prez').value.trim(), 
                logo: finalLogo, 
                couleur: document.getElementById('new-couleur').value || "#009EE3", 
                insta: document.getElementById('new-insta').value.trim() || "", 
                photo_coll: finalColl, 
                classement: finalRank 
            };
    
            if (editingType !== null) {
                currentData[editingType][editingIndex] = listObj;
            } else {
                if (!finalLogo) throw new Error("Le logo est obligatoire pour une nouvelle liste");
                currentData[type].push(listObj);
            }
    
            await saveAll();
            cancelEditList();
        } catch (err) {
            showStatus("❌ " + err.message, true);
            btn.disabled = false;
            btn.innerText = "💾 Réessayer";
            document.querySelectorAll('input[type="file"]').forEach(el => el.value = "");
        }
    };

    document.getElementById('btn-cancel-edit-list').onclick = cancelEditList;
}
