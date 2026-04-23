import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    addDoc,
    collection,
    getDocs,
    query,
    where,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = getFirestore();

const ecolesList = [
    { id: "lille",        nom: "Lille" },
    { id: "sorbonne",     nom: "Paris-Sorbonne" },
    { id: "saclay",       nom: "Paris-Saclay" },
    { id: "nancy",        nom: "Nancy" },
    { id: "dijon",        nom: "Dijon" },
    { id: "nantes",       nom: "Nantes" },
    { id: "angers",       nom: "Angers" },
    { id: "orleans",      nom: "Orléans" },
    { id: "tours",        nom: "Tours" },
    { id: "clermont",     nom: "Clermont-Ferrand" },
    { id: "lyon",         nom: "Lyon" },
    { id: "annecy",       nom: "Annecy-Chambéry" },
    { id: "grenoble",     nom: "Grenoble" },
    { id: "montpellier",  nom: "Montpellier" },
    { id: "marseille",    nom: "Marseille" },
    { id: "nice",         nom: "Nice Sophia" }
];

function getEcoleNom(id) {
    return ecolesList.find(e => e.id === id)?.nom || id || "—";
}

/**
 * Logique d'application des propositions
 */
async function applyProposal(proposal) {
    const { ecole, annee, type, payload } = proposal;

    if (!type || !payload) {
        throw new Error("Proposal invalide (champ manquant).");
    }

    // Références des documents cibles (pour les types liste/events)
    const archiveRef = ecole && annee ? doc(db, "ecoles", ecole, "archives", annee) : null;
    const eventRef   = ecole && annee ? doc(db, "ecoles", ecole, "events", annee) : null;

    switch (type) {
        
        // 1. GESTION DES ÉVÉNEMENTS
        case "event_local_add": {
            const snap = await getDoc(eventRef);
            let data = snap.exists() ? snap.data() : {};
            const locaux = Array.isArray(data.locaux) ? data.locaux : [];
            if (!locaux.find(ev => ev.id === payload.id)) {
                locaux.push(payload);
                await setDoc(eventRef, { locaux }, { merge: true });
            }
            break;
        }

        // 2. AJOUTS DE LISTES (BDE, BDP, FAKE)
        case "liste_bde_add":
        case "liste_bdp_add":
        case "fakeliste_add": {
            const collectionKey = type === "fakeliste_add" ? "fakelistes" : (type === "liste_bde_add" ? "listes_bde" : "listes_bdp");
            
            const snap = await getDoc(archiveRef);
            let data = snap.exists() ? snap.data() : {};
            const currentList = Array.isArray(data[collectionKey]) ? data[collectionKey] : [];
            
            currentList.push(payload);
            await setDoc(archiveRef, { [collectionKey]: currentList }, { merge: true });
            break;
        }

        // 3. MODIFICATIONS DE LISTES (BDE, BDP, FAKE)
        case "liste_bde_edit":
        case "liste_bdp_edit":
        case "fakeliste_edit": {
            const collectionKey = type === "fakeliste_edit" ? "fakelistes" : (type === "liste_bde_edit" ? "listes_bde" : "listes_bdp");
            
            const snap = await getDoc(archiveRef);
            if (!snap.exists()) throw new Error("L'archive n'existe pas encore.");
            
            let data = snap.data();
            const currentList = Array.isArray(data[collectionKey]) ? data[collectionKey] : [];
            
            const index = currentList.findIndex(l => l.nom === payload.nom);
            if (index !== -1) {
                currentList[index] = payload;
                await updateDoc(archiveRef, { [collectionKey]: currentList });
            } else {
                throw new Error("Liste introuvable pour modification.");
            }
            break;
        }

        // 4. INFOS BUREAUX (BDE / BDP)
        case "bde_info":
        case "bdp_info": {
            const field = type === "bde_info" ? "bde_actuel" : "bdp_actuel";
            const snap = await getDoc(archiveRef);
            let existingData = snap.exists() ? (snap.data()[field] || {}) : {};
            const merged = { ...existingData, ...payload };
            await setDoc(archiveRef, { [field]: merged }, { merge: true });
            break;
        }

        // 5. DATES DE CAMPAGNE / PASSATION
        case "dates": {
            await setDoc(archiveRef, payload, { merge: true });
            break;
        }

        // =============================================
        // 6. BRACELETS — AJOUT
        // =============================================
        case "bracelet_add": {
            const { braceletId, ...braceletData } = payload;
            // Créer un nouveau document dans la collection "bracelets"
            await addDoc(collection(db, "bracelets"), {
                ...braceletData,
                approvedAt: new Date(),
                approvedBy: 'admin'
            });
            break;
        }

        // =============================================
        // 7. BRACELETS — MODIFICATION
        // =============================================
        case "bracelet_edit": {
            const { braceletId, ...braceletData } = payload;
            if (!braceletId) throw new Error("braceletId manquant pour la modification.");
            await setDoc(doc(db, "bracelets", braceletId), {
                ...braceletData,
                updatedAt: new Date(),
                updatedBy: 'admin'
            }, { merge: true });
            break;
        }

        default:
            throw new Error(`Type de proposition non géré: ${type}`);
    }
}

/**
 * Met à jour le statut du document de proposition
 */
async function markProposal(proposalId, status) {
    const ref = doc(db, "proposals", proposalId);
    await updateDoc(ref, {
        status,
        processedAt: new Date()
    });
}

/**
 * Rendu du label d'une proposition selon son type
 */
function getProposalLabel(p) {
    if (p.type === 'bracelet_add' || p.type === 'bracelet_edit') {
        return `🪬 ${p.payload?.texte || 'Bracelet'} (${p.payload?.ville || '?'} · ${p.payload?.annee || '?'})`;
    }
    return p.payload?.nom || p.payload?.title || p.type || "(Détails)";
}

/**
 * Rendu du détail d'une proposition selon son type
 */
function renderProposalDetail(p) {
    if (p.type === 'bracelet_add' || p.type === 'bracelet_edit') {
        const bg = p.payload?.couleurFond || '#003057';
        const txt = p.payload?.couleurTexte || '#ffffff';
        const texte = p.payload?.texte || 'BRACELET';
        return `
            <div style="margin-top:10px;">
                <div style="display:inline-flex;align-items:center;justify-content:center;
                    background:${bg};color:${txt};height:36px;border-radius:40px;
                    padding:0 20px;font-size:10px;font-weight:900;letter-spacing:2px;
                    text-transform:uppercase;border:2px solid rgba(255,255,255,0.1);">
                    ${texte.toUpperCase()}
                </div>
                <div style="margin-top:8px;font-size:0.82em;color:#aaa;">
                    Fond: ${bg} · Texte: ${txt}
                    ${p.payload?.listeLiee ? ' · 🔗 ' + p.payload.listeLiee : ''}
                </div>
            </div>
        `;
    }
    return `<pre style="font-size:0.8em;color:#aaa;margin-top:8px;white-space:pre-wrap;">${JSON.stringify(p.payload, null, 2)}</pre>`;
}

/**
 * Charge et affiche les propositions
 */
async function loadPendingProposals(currentUser) {
    const tbody   = document.getElementById("approbation-table-body");
    const table   = document.getElementById("approbation-table");
    const statusP = document.getElementById("approbation-status");

    if (!tbody) return;

    tbody.innerHTML = "";
    if (statusP) {
        statusP.textContent = "Chargement des propositions...";
        statusP.style.color = "#aaa";
    }
    if (table) table.style.display = "none";

    try {
        let q;
        if (currentUser.role === "admin") {
            q = query(collection(db, "proposals"), where("status", "==", "pending"));
        } else {
            q = query(
                collection(db, "proposals"),
                where("status", "==", "pending"),
                where("ecole", "==", currentUser.ecole || "")
            );
        }

        const snap = await getDocs(q);

        if (snap.empty) {
            if (statusP) {
                statusP.textContent = "Aucune proposition en attente.";
                statusP.style.color = "#666";
            }
            return;
        }

        const proposals = [];
        snap.forEach(docSnap => {
            proposals.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Tri alpha école puis année
        proposals.sort((a, b) => {
            const ea = a.ecole || "";
            const eb = b.ecole || "";
            if (ea !== eb) return ea.localeCompare(eb);
            return (a.annee || "").localeCompare(b.annee || "");
        });

        proposals.forEach(p => {
            const ecoleNom = getEcoleNom(p.ecole);
            const label = getProposalLabel(p);
            const isBracelet = p.type === 'bracelet_add' || p.type === 'bracelet_edit';

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding:12px; border-bottom:1px solid #222;">
                    <strong style="color:${isBracelet ? '#f09433' : '#009EE3'};">${label}</strong>
                    <div style="font-size:0.8em; color:#777; margin-top:4px;">
                        Par ${p.authorPrenom || "Anonyme"} (${p.authorEmail})
                    </div>
                    ${isBracelet ? renderProposalDetail(p) : ''}
                </td>
                <td style="padding:12px; border-bottom:1px solid #222; color:#ccc;">${ecoleNom}</td>
                <td style="padding:12px; border-bottom:1px solid #222; color:#ccc;">${p.annee || "—"}</td>
                <td style="padding:12px; border-bottom:1px solid #222;">
                    <span style="background:${isBracelet ? 'rgba(240,148,51,0.15)' : 'rgba(0,158,227,0.1)'};
                        color:${isBracelet ? '#f09433' : '#009EE3'};
                        padding:3px 8px; border-radius:4px; font-size:0.8em;">
                        ${p.type}
                    </span>
                </td>
                <td style="padding:12px; border-bottom:1px solid #222; text-align:right;">
                    ${!isBracelet ? `<button class="btn-voir-prop" data-id="${p.id}" style="cursor:pointer; background:#333; color:white; border:none; padding:5px 10px; border-radius:4px; margin-right:5px;">👁️</button>` : ''}
                    <button class="btn-approve-prop" data-id="${p.id}" style="cursor:pointer; background:#28a745; color:white; border:none; padding:5px 10px; border-radius:4px; margin-right:5px;">✅</button>
                    <button class="btn-reject-prop" data-id="${p.id}" style="cursor:pointer; background:#cb2d3e; color:white; border:none; padding:5px 10px; border-radius:4px;">❌</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Event Listeners
        tbody.querySelectorAll(".btn-voir-prop").forEach(btn => {
            btn.onclick = () => {
                const prop = proposals.find(x => x.id === btn.dataset.id);
                alert("Contenu de la proposition :\n" + JSON.stringify(prop.payload, null, 2));
            };
        });

        tbody.querySelectorAll(".btn-approve-prop").forEach(btn => {
            btn.onclick = async () => {
                const prop = proposals.find(x => x.id === btn.dataset.id);
                if (!confirm(`Approuver cette modification (${prop.type}) ?`)) return;
                
                try {
                    btn.disabled = true;
                    await applyProposal(prop);
                    await markProposal(prop.id, "approved");
                    
                    if (prop.authorEmail) {
                        const uRef = doc(db, "users", prop.authorEmail);
                        const uSnap = await getDoc(uRef);
                        if (uSnap.exists()) {
                            await updateDoc(uRef, { proposalsCount: (uSnap.data().proposalsCount || 0) + 1 });
                        }
                    }
                    await loadPendingProposals(currentUser);
                } catch (e) {
                    alert("Erreur : " + e.message);
                    btn.disabled = false;
                }
            };
        });

        tbody.querySelectorAll(".btn-reject-prop").forEach(btn => {
            btn.onclick = async () => {
                if (!confirm("Refuser cette proposition ?")) return;
                btn.disabled = true;
                await markProposal(btn.dataset.id, "rejected");
                await loadPendingProposals(currentUser);
            };
        });

        if (statusP) statusP.textContent = `${proposals.length} proposition(s) en attente.`;
        if (table) table.style.display = "table";

    } catch (e) {
        console.error(e);
        if (statusP) statusP.textContent = "Erreur de chargement.";
    }
}

export function initApprobation(currentUser) {
    if (!currentUser) return;
    loadPendingProposals(currentUser);
}
