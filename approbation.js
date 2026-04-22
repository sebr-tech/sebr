import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = getFirestore();

const ecolesList = [
  { id: "lille",       nom: "Lille" },
  { id: "sorbonne",    nom: "Paris-Sorbonne" },
  { id: "saclay",      nom: "Paris-Saclay" },
  { id: "nancy",       nom: "Nancy" },
  { id: "dijon",       nom: "Dijon" },
  { id: "nantes",      nom: "Nantes" },
  { id: "angers",      nom: "Angers" },
  { id: "orleans",     nom: "Orléans" },
  { id: "tours",       nom: "Tours" },
  { id: "clermont",    nom: "Clermont-Ferrand" },
  { id: "lyon",        nom: "Lyon" },
  { id: "annecy",      nom: "Annecy-Chambéry" },
  { id: "grenoble",    nom: "Grenoble" },
  { id: "montpellier", nom: "Montpellier" },
  { id: "marseille",   nom: "Marseille" },
  { id: "nice",        nom: "Nice Sophia" }
];

function getEcoleNom(id) {
  return ecolesList.find(e => e.id === id)?.nom || id || "—";
}

/**
 * Applique une proposition dans la DB finale.
 * Ici on gère explicitement type = "event_local_add".
 * Tu pourras ajouter d'autres types dans le switch.
 */
async function applyProposal(proposal) {
  const { ecole, annee, type, payload } = proposal;

  if (!ecole || !annee || !type || !payload) {
    throw new Error("Proposal invalide (champ manquant).");
  }

  if (type === "event_local_add") {
    // Cible : ecoles/{ecole}/events/{annee}
    const targetRef = doc(db, "ecoles", ecole, "events", annee);
    const snap = await getDoc(targetRef);

    let data = {};
    if (snap.exists()) {
      data = snap.data();
    }

    const locaux = Array.isArray(data.locaux) ? data.locaux : [];

    // On ajoute l'event (en évitant les doublons sur payload.id)
    const already = locaux.find(ev => ev.id === payload.id);
    if (!already) {
      locaux.push(payload);
    }

    await setDoc(
      targetRef,
      { locaux },
      { merge: true }
    );
  } else {
    // Sécurité : si tu approuves un type non géré
    throw new Error(`Type de proposition non géré: ${type}`);
  }
}

/**
 * Met à jour le doc proposal après traitement
 */
async function markProposal(proposalId, status) {
  const ref = doc(db, "proposals", proposalId);
  await updateDoc(ref, {
    status,
    processedAt: new Date()
  });
}

/**
 * Charge les propositions en attente dans le tableau d'approbations
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
    // Filtrage selon rôle
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

    // Tri: par école puis année
    proposals.sort((a, b) => {
      const ea = a.ecole || "";
      const eb = b.ecole || "";
      if (ea !== eb) return ea.localeCompare(eb);
      const aa = a.annee || "";
      const ab = b.annee || "";
      return aa.localeCompare(ab);
    });

    proposals.forEach(p => {
      const ecoleNom = getEcoleNom(p.ecole);
      const annee    = p.annee || "—";
      const type     = p.type || "—";

      const label =
        p.payload?.nom ||
        p.payload?.title ||
        "(Sans titre)";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="padding:8px; max-width:260px;">
          <strong style="color:white;">${label}</strong>
          <div style="font-size:0.8em; color:#999; margin-top:2px;">
            Proposé par ${p.authorPrenom || ""} ${p.authorEmail || "?"}
          </div>
        </td>
        <td style="padding:8px; color:#ccc;">${ecoleNom}</td>
        <td style="padding:8px; color:#ccc;">${annee}</td>
        <td style="padding:8px; color:#ccc;">${type}</td>
        <td style="padding:8px; text-align:right;">
          <button class="btn-voir-prop" data-id="${p.id}"
            style="background:none; border:1px solid #444; color:#ccc; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8em; margin-right:4px;">
            Détails
          </button>
          <button class="btn-approve-prop" data-id="${p.id}"
            style="background:#28a745; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.8em; font-weight:bold; margin-right:4px;">
            ✅ Approuver
          </button>
          <button class="btn-reject-prop" data-id="${p.id}"
            style="background:#2c2c2c; color:#ff8080; border:1px solid #ff8080; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.8em;">
            ❌ Refuser
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Boutons "Détails"
    tbody.querySelectorAll(".btn-voir-prop").forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const prop = proposals.find(p => p.id === id);
        if (!prop) return;

        alert(
          "Détails de la proposition:\n\n" +
          JSON.stringify(prop, null, 2)
        );
      };
    });

    // Boutons "Approuver"
    tbody.querySelectorAll(".btn-approve-prop").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const prop = proposals.find(p => p.id === id);
        if (!prop) return;

        const ecoleNom = getEcoleNom(prop.ecole);
        const confirmMsg =
          `Approuver cette proposition pour ${ecoleNom} (${prop.annee || "année ?"}) ?\n\n` +
          `Type: ${prop.type || "—"}\n` +
          `Titre: ${prop.payload?.nom || "(Sans titre)"}`;

        if (!confirm(confirmMsg)) return;

        try {
          btn.disabled = true;
          await applyProposal(prop);
          await markProposal(id, "approved");

          // Optionnel: incrémenter proposalsCount
          if (prop.authorEmail) {
            try {
              const userRef = doc(db, "users", prop.authorEmail);
              const userSnap = await getDoc(userRef);
              if (userSnap.exists()) {
                const current = userSnap.data().proposalsCount || 0;
                await updateDoc(userRef, { proposalsCount: current + 1 });
              }
            } catch (e) {
              console.warn("Impossible de mettre à jour proposalsCount:", e);
            }
          }

          await loadPendingProposals(currentUser);
        } catch (e) {
          console.error("Erreur approbation:", e);
          alert("Erreur lors de l'approbation: " + e.message);
          btn.disabled = false;
        }
      };
    });

    // Boutons "Refuser"
    tbody.querySelectorAll(".btn-reject-prop").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const prop = proposals.find(p => p.id === id);
        if (!prop) return;

        if (!confirm("Refuser définitivement cette proposition ?")) return;

        try {
          btn.disabled = true;
          await markProposal(id, "rejected");
          await loadPendingProposals(currentUser);
        } catch (e) {
          console.error("Erreur refus:", e);
          alert("Erreur lors du refus: " + e.message);
          btn.disabled = false;
        }
      };
    });

    if (statusP) {
      statusP.textContent = `${proposals.length} proposition(s) en attente.`;
      statusP.style.color = "#aaa";
    }
    if (table) table.style.display = "table";
  } catch (e) {
    console.error("Erreur chargement proposals:", e);
    if (statusP) {
      statusP.textContent = "Erreur de chargement des propositions.";
      statusP.style.color = "#ff8080";
    }
  }
}

/**
 * Appelée depuis admin.html
 */
export function initApprobation(currentUser) {
  if (!currentUser) return;
  loadPendingProposals(currentUser);
}
