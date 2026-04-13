import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = getFirestore();

const ecolesList = [
    { id: "lille", nom: "Lille" },
    { id: "sorbonne", nom: "Paris-Sorbonne" },
    { id: "saclay", nom: "Paris-Saclay" },
    { id: "nancy", nom: "Nancy" },
    { id: "dijon", nom: "Dijon" },
    { id: "nantes", nom: "Nantes" },
    { id: "angers", nom: "Angers" },
    { id: "orleans", nom: "Orléans" },
    { id: "tours", nom: "Tours" },
    { id: "clermont", nom: "Clermont-Ferrand" },
    { id: "lyon", nom: "Lyon" },
    { id: "annecy", nom: "Annecy-Chambéry" },
    { id: "grenoble", nom: "Grenoble" },
    { id: "montpellier", nom: "Montpellier" },
    { id: "marseille", nom: "Marseille" },
    { id: "nice", nom: "Nice Sophia" }
];

// --- FONCTION DE CHARGEMENT DE LA LISTE ---
async function loadUsersList() {
    const tbody = document.getElementById('user-table-body');
    const table = document.getElementById('user-table');
    const loading = document.getElementById('loading-users');

    if (!tbody) return;

    tbody.innerHTML = '';
    if (loading) loading.style.display = 'block';
    if (table) table.style.display = 'none';

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        
        if (querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#666;">Aucun utilisateur configuré.</td></tr>';
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const email = docSnap.id;
            const role = data.role || "editor";
            const ecoleId = data.ecole || "";
            
            const ecoleObj = ecolesList.find(e => e.id === ecoleId);
            const ecoleNom = ecoleObj ? ecoleObj.nom : (role === "admin" ? "Toutes" : "-");

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:bold; color:white;">${email}</td>
                <td><span class="badge badge-${role}">${role}</span></td>
                <td style="color:#aaa;">${ecoleNom}</td>
                <td style="text-align:right;">
                    ${email === 'sebrpolytech@gmail.com' ? 
                        '👑' : 
                        `<button class="btn-delete-user" data-email="${email}" style="background:none; border:none; color:#555; cursor:pointer;">🗑️</button>`
                    }
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Gestion de la suppression
        tbody.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.onclick = async () => {
                if (confirm(`Révoquer l'accès pour ${btn.dataset.email} ?`)) {
                    await deleteDoc(doc(db, "users", btn.dataset.email));
                    loadUsersList();
                }
            };
        });

        if (loading) loading.style.display = 'none';
        if (table) table.style.display = 'table';

    } catch (e) {
        console.error("Erreur users:", e);
        if (loading) loading.innerText = "Erreur de chargement.";
    }
}

// --- INITIALISATION DU MODULE ---
export function initAddUser() {
    const roleSelect = document.getElementById('new-user-role');
    const ecoleContainer = document.getElementById('container-ecole-selector');
    const ecoleSelect = document.getElementById('new-user-ecole');
    const btnAdd = document.getElementById('btn-add-user');

    if (!roleSelect || !ecoleSelect || !btnAdd) return;

    // 1. Remplir le select des écoles
    ecoleSelect.innerHTML = "";
    ecolesList.forEach(ecole => {
        const opt = document.createElement('option');
        opt.value = ecole.id;
        opt.textContent = ecole.nom;
        ecoleSelect.appendChild(opt);
    });

    // 2. Affichage conditionnel du sélecteur d'école
    roleSelect.onchange = () => {
        ecoleContainer.style.display = (roleSelect.value === 'editor') ? 'block' : 'none';
    };
    roleSelect.onchange(); // Exécuter une fois au départ

    // 3. Action du bouton d'ajout
    btnAdd.onclick = async () => {
        const email = document.getElementById('new-user-email').value.trim().toLowerCase();
        const role = roleSelect.value;
        const ecole = ecoleSelect.value;
        const statusP = document.getElementById('adduser-status');

        if (!email.includes('@')) {
            alert("Email invalide");
            return;
        }

        btnAdd.disabled = true;
        try {
            await setDoc(doc(db, "users", email), {
                role: role,
                ecole: role === 'admin' ? "" : ecole
            });
            if (statusP) statusP.innerText = "✅ Utilisateur ajouté avec succès.";
            document.getElementById('new-user-email').value = "";
            loadUsersList(); // Recharger la liste immédiatement
        } catch (e) {
            alert("Erreur lors de l'ajout : " + e.message);
        }
        btnAdd.disabled = false;
    };

    // 4. LANCEMENT AUTOMATIQUE DE LA LISTE
    loadUsersList();
}