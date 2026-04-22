import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

async function loadUsersList() {
    const tbody   = document.getElementById('user-table-body');
    const table   = document.getElementById('user-table');
    const loading = document.getElementById('loading-users');

    if (!tbody) return;

    tbody.innerHTML = '';
    if (loading) loading.style.display = 'block';
    if (table)   table.style.display   = 'none';

    try {
        const querySnapshot = await getDocs(collection(db, "users"));

        if (querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#666;">Aucun utilisateur configuré.</td></tr>';
        }

        // Tri : admin → editor → user, puis alphabétique
        const users = [];
        querySnapshot.forEach(docSnap => users.push({ id: docSnap.id, ...docSnap.data() }));
        const roleOrder = { admin: 0, editor: 1, user: 2 };
        users.sort((a, b) => (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3) || a.id.localeCompare(b.id));

        users.forEach(data => {
            const email   = data.id;
            const role    = data.role    || "user";
            const ecoleId = data.ecole   || "";
            const prenom  = data.prenom  || "";
            const proposals = data.proposalsCount ?? "—";

            const ecoleObj  = ecolesList.find(e => e.id === ecoleId);
            const ecoleNom  = ecoleObj ? ecoleObj.nom : (role === "admin" ? "Toutes" : "—");

            const isOwner   = email === 'sebrpolytech@gmail.com';

            // Boutons d'action selon le rôle
            let actionHtml = '';
            if (isOwner) {
                actionHtml = '👑';
            } else if (role === 'user') {
                actionHtml = `
                    <button class="btn-promote" data-email="${email}" data-ecole="${ecoleId}"
                        style="background:#28a745; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.8em; font-weight:bold; margin-right:4px;">
                        ⬆️ Éditeur
                    </button>
                    <button class="btn-delete-user" data-email="${email}"
                        style="background:none; border:none; color:#555; cursor:pointer; font-size:1.2em;">🗑️</button>
                `;
            } else if (role === 'editor') {
                actionHtml = `
                    <button class="btn-demote" data-email="${email}"
                        style="background:#f09433; color:black; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.8em; font-weight:bold; margin-right:4px;">
                        ⬇️ User
                    </button>
                    <button class="btn-delete-user" data-email="${email}"
                        style="background:none; border:none; color:#555; cursor:pointer; font-size:1.2em;">🗑️</button>
                `;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:bold; color:white; font-size:0.9em;">${email}${prenom ? `<br><span style="font-weight:normal; color:#aaa; font-size:0.85em;">${prenom}</span>` : ''}</td>
                <td><span class="badge badge-${role}">${role}</span></td>
                <td style="color:#aaa; font-size:0.9em;">${ecoleNom}</td>
                <td style="color:#666; font-size:0.85em; text-align:center;">${proposals}</td>
                <td style="text-align:right;">${actionHtml}</td>
            `;
            tbody.appendChild(tr);
        });

        // Promotion user → editor
        tbody.querySelectorAll('.btn-promote').forEach(btn => {
            btn.onclick = async () => {
                const email = btn.dataset.email;
                const ecole = btn.dataset.ecole;

                // Sélection de l'école via prompt si pas d'école définie
                let ecoleToSet = ecole;
                if (!ecoleToSet) {
                    const choix = prompt(`École pour l'éditeur ${email} :\n${ecolesList.map((e,i) => `${i+1}. ${e.nom}`).join('\n')}\n\nEntrez le numéro :`);
                    const idx = parseInt(choix) - 1;
                    if (isNaN(idx) || !ecolesList[idx]) { alert("École invalide."); return; }
                    ecoleToSet = ecolesList[idx].id;
                }

                if (!confirm(`Promouvoir ${email} en ÉDITEUR pour ${ecolesList.find(e=>e.id===ecoleToSet)?.nom || ecoleToSet} ?`)) return;
                await updateDoc(doc(db, "users", email), { role: 'editor', ecole: ecoleToSet });
                loadUsersList();
            };
        });

        // Rétrogradation editor → user
        tbody.querySelectorAll('.btn-demote').forEach(btn => {
            btn.onclick = async () => {
                const email = btn.dataset.email;
                if (!confirm(`Rétrograder ${email} en UTILISATEUR ?`)) return;
                await updateDoc(doc(db, "users", email), { role: 'user' });
                loadUsersList();
            };
        });

        // Suppression
        tbody.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.onclick = async () => {
                const email = btn.dataset.email;
                if (confirm(`Révoquer l'accès pour ${email} ?`)) {
                    await deleteDoc(doc(db, "users", email));
                    loadUsersList();
                }
            };
        });

        if (loading) loading.style.display = 'none';
        if (table)   table.style.display   = 'table';

    } catch (e) {
        console.error("Erreur users:", e);
        if (loading) loading.innerText = "Erreur de chargement.";
    }
}

export function initAddUser() {
    const roleSelect      = document.getElementById('new-user-role');
    const ecoleContainer  = document.getElementById('container-ecole-selector');
    const ecoleSelect     = document.getElementById('new-user-ecole');
    const btnAdd          = document.getElementById('btn-add-user');

    if (!roleSelect || !ecoleSelect || !btnAdd) return;

    // Remplir le select des écoles
    ecoleSelect.innerHTML = "";
    ecolesList.forEach(ecole => {
        const opt = document.createElement('option');
        opt.value       = ecole.id;
        opt.textContent = ecole.nom;
        ecoleSelect.appendChild(opt);
    });

    // Affichage conditionnel du sélecteur d'école
    roleSelect.onchange = () => {
        ecoleContainer.style.display = (roleSelect.value === 'editor') ? 'block' : 'none';
    };
    roleSelect.onchange();

    // Ajout d'un éditeur/admin pré-approuvé
    btnAdd.onclick = async () => {
        const email      = document.getElementById('new-user-email').value.trim().toLowerCase();
        const role       = roleSelect.value;
        const ecole      = ecoleSelect.value;
        const statusP    = document.getElementById('adduser-status');

        if (!email.includes('@')) { alert("Email invalide"); return; }

        btnAdd.disabled = true;
        try {
            await setDoc(doc(db, "users", email), {
                role:  role,
                ecole: role === 'admin' ? "" : ecole
            }, { merge: true });
            if (statusP) statusP.innerText = "✅ Accès ajouté. L'utilisateur pourra créer son compte.";
            document.getElementById('new-user-email').value = "";
            loadUsersList();
        } catch (e) {
            alert("Erreur lors de l'ajout : " + e.message);
        }
        btnAdd.disabled = false;
    };

    loadUsersList();
}
