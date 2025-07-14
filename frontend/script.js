document.addEventListener("DOMContentLoaded", () => {
  const API_URL = "http://localhost:5000/api";

  // Elementos da UI
  const loginView = document.getElementById("login-view");
  const bodyOverflowHidden = document.getElementById("body-hidden");
  const navBar = document.getElementById("navbar");
  const appContent = document.getElementById("app-content");
  const authNavLinks = document.getElementById("auth-nav-links");
  const notebooksContainer = document.getElementById("notebooks-container");
  const reservasContainer = document.getElementById("reservas-container");
  const reservasPlaceholder = document.getElementById("reservas-placeholder");
  const gerenciarNotebooksList = document.getElementById(
    "gerenciar-notebooks-list"
  );
  const reservationCtaContainer = document.getElementById(
    "reservation-cta-container"
  );
  const reserveSelectedBtn = document.getElementById("reserveSelectedBtn");
  const selectedCountBadge = document.getElementById("selected-count-badge");
  const selectedNotebooksList = document.getElementById(
    "selectedNotebooksList"
  );
  const historyContainer = document.getElementById("history-container");
  const usersContainer = document.getElementById("users-container");
  const reservasActionsHeader = document.getElementById(
    "reservas-actions-header"
  );

  // Modais
  const reservaModal = new bootstrap.Modal(
    document.getElementById("reservaModal")
  );
  const gerenciarNotebooksModal = new bootstrap.Modal(
    document.getElementById("gerenciarNotebooksModal")
  );
  const notebookFormModal = new bootstrap.Modal(
    document.getElementById("notebookFormModal")
  );
  const gerenciarUsuariosModal = new bootstrap.Modal(
    document.getElementById("gerenciarUsuariosModal")
  );
  const historicoModal = new bootstrap.Modal(
    document.getElementById("historicoModal")
  );

  // Formulários e Botões
  const reservaForm = document.getElementById("reservaForm");
  const loginForm = document.getElementById("loginForm");
  const notebookForm = document.getElementById("notebookForm");
  const addNotebookBtn = document.getElementById("addNotebookBtn");

  let allNotebooks = [];
  let selectedNotebooks = new Set();

  // --- GERENCIAMENTO DE AUTENTICAÇÃO ---
  const getToken = () => localStorage.getItem("authToken");
  const getUser = () => JSON.parse(localStorage.getItem("authUser"));
  const logout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
    updateUI();
  };

  const apiFetch = async (endpoint, options = {}) => {
    const token = getToken();
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });
    if ([401, 403].includes(response.status)) {
      logout();
      showNotification(
        "Sua sessão expirou. Por favor, faça login novamente.",
        "danger"
      );
      throw new Error("Não autorizado");
    }
    if (!response.ok) {
      const contentType = response.headers.get("content-type");
      let errorMessage = `Erro ${response.status}: ${response.statusText}`;
      if (contentType?.includes("application/json")) {
        const errorData = await response.json().catch(() => null);
        errorMessage = errorData?.error || JSON.stringify(errorData);
      } else {
        errorMessage = await response.text().catch(() => errorMessage);
      }
      throw new Error(errorMessage);
    }
    if (response.headers.get("content-type")?.includes("application/json")) {
      return response.json();
    }
  };

  // --- LÓGICA DE LOGIN ---
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: loginForm.loginUsername.value,
          password: loginForm.loginPassword.value,
        }),
      });
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("authUser", JSON.stringify(data.user));
      showNotification("Login realizado com sucesso!", "success");
      updateUI();
    } catch (error) {
      showNotification(`Erro no login: ${error.message}`, "danger");
    }
  });

  // --- LÓGICA DA APLICAÇÃO ---
  const loadData = async () => {
    try {
      const [notebooksData, reservas] = await Promise.all([
        apiFetch("/notebooks"),
        apiFetch("/reservas"),
      ]);
      allNotebooks = notebooksData;
      const notebooksVisiveis = allNotebooks.filter(
        (n) => n.status !== "inativo"
      );
      renderNotebooks(notebooksVisiveis, reservas);
      renderReservas(reservas);
      if (getUser()?.role === "admin") renderGerenciarNotebooksList();
    } catch (error) {
      if (error.message !== "Não autorizado") {
        showNotification(
          `Erro ao carregar dados: ${error.message}`,
          "danger"
        );
        notebooksContainer.innerHTML =
          '<p class="text-danger">Erro ao carregar dados.</p>';
      }
    }
  };

  window.cancelarReserva = async (reservaId) => {
    if (!confirm("Tem certeza que deseja cancelar esta reserva?")) return;
    try {
      await apiFetch(`/reservas/${reservaId}`, { method: "DELETE" });
      showNotification("Reserva cancelada com sucesso!", "success");
      loadData();
    } catch (error) {
      showNotification(
        `Erro ao cancelar reserva: ${error.message}`,
        "danger"
      );
    }
  };

  reservaForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = event.submitter;
    submitButton.disabled = true;
    submitButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Reservando...`;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataDevolucao = new Date(
      reservaForm.dataDevolucao.value + "T00:00:00"
    );
    if (dataDevolucao < hoje) {
      showNotification(
        "A data de devolução não pode ser no passado.",
        "warning"
      );
      submitButton.disabled = false;
      submitButton.innerHTML = "Confirmar Reserva";
      return;
    }
    dataDevolucao.setHours(23, 59, 59, 999);
    const reservaData = {
      responsavel: reservaForm.responsavel.value,
      data_inicio: new Date().toISOString(),
      data_fim: dataDevolucao.toISOString(),
      notebooks_ids: Array.from(selectedNotebooks),
    };
    try {
      await apiFetch("/reservas", {
        method: "POST",
        body: JSON.stringify(reservaData),
      });
      reservaModal.hide();
      showNotification("Reserva criada com sucesso!", "success");
      selectedNotebooks.clear();
      updateSelectionUI();
      loadData();
    } catch (error) {
      showNotification(
        `Erro ao criar reserva: ${error.message}`,
        "danger"
      );
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = "Confirmar Reserva";
    }
  });

  reserveSelectedBtn.addEventListener("click", () => {
    const user = getUser();
    reservaForm.responsavel.value = `${user.nome} (${
      user.matricula || "N/A"
    })`;
    selectedNotebooksList.innerHTML = "";
    selectedNotebooks.forEach((id) => {
      const notebook = allNotebooks.find((n) => n.id === id);
      if (notebook) {
        const item = document.createElement("div");
        item.className = "list-group-item";
        item.textContent = `${notebook.nome} ${
          notebook.patrimonio ? "(" + notebook.patrimonio + ")" : ""
        }`;
        selectedNotebooksList.appendChild(item);
      }
    });
    reservaModal.show();
  });

  // --- GERENCIAMENTO DE NOTEBOOKS ---
  addNotebookBtn.addEventListener("click", () => {
    notebookForm.reset();
    notebookForm.notebookEditId.value = "";
    document.getElementById("notebookFormModalLabel").textContent =
      "Cadastrar Novo Notebook";
    gerenciarNotebooksModal.hide();
    notebookFormModal.show();
  });

  notebookForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = notebookForm.notebookEditId.value;
    const notebookData = {
      nome: notebookForm.notebookNome.value,
      patrimonio: notebookForm.notebookPatrimonio.value,
      status: notebookForm.notebookStatus.value,
    };
    const method = id ? "PUT" : "POST";
    const endpoint = id ? `/notebooks/${id}` : "/notebooks";
    try {
      await apiFetch(endpoint, {
        method,
        body: JSON.stringify(notebookData),
      });
      showNotification(
        `Notebook ${id ? "atualizado" : "cadastrado"} com sucesso!`,
        "success"
      );
      notebookFormModal.hide();
      loadData();
    } catch (error) {
      showNotification(
        `Erro ao salvar notebook: ${error.message}`,
        "danger"
      );
    }
  });

  window.handleEditNotebook = (id) => {
    const notebook = allNotebooks.find((n) => n.id === id);
    if (!notebook) return;
    notebookForm.reset();
    notebookForm.notebookEditId.value = notebook.id;
    notebookForm.notebookNome.value = notebook.nome;
    notebookForm.notebookPatrimonio.value = notebook.patrimonio || "";
    notebookForm.notebookStatus.value = notebook.status;
    document.getElementById("notebookFormModalLabel").textContent =
      "Editar Notebook";
    gerenciarNotebooksModal.hide();
    notebookFormModal.show();
  };

  window.handleDeleteNotebook = async (id) => {
    const notebook = allNotebooks.find((n) => n.id === id);
    if (!notebook) return;
    if (
      !confirm(
        `Tem certeza que deseja marcar o notebook "${notebook.nome}" como inativo?`
      )
    )
      return;
    try {
      await apiFetch(`/notebooks/${id}`, { method: "DELETE" });
      showNotification("Notebook inativado com sucesso.", "success");
      loadData();
    } catch (error) {
      showNotification(
        `Erro ao inativar notebook: ${error.message}`,
        "danger"
      );
    }
  };

  // --- FUNÇÕES DE RENDERIZAÇÃO E UI ---
  const toggleNotebookSelection = (id) => {
    if (selectedNotebooks.has(id)) selectedNotebooks.delete(id);
    else selectedNotebooks.add(id);
    updateSelectionUI();
  };

  const updateSelectionUI = () => {
    document.querySelectorAll(".notebook-card").forEach((card) => {
      card.classList.toggle(
        "selected",
        selectedNotebooks.has(parseInt(card.dataset.id))
      );
    });
    const count = selectedNotebooks.size;
    selectedCountBadge.textContent = count;
    reservationCtaContainer.style.display = count > 0 ? "block" : "none";
  };

  const updateUI = () => {
    const token = getToken();
    document
      .querySelectorAll(".admin-only-flex")
      .forEach((el) => (el.style.display = "none"));
    if (token) {
      const user = getUser();
      bodyOverflowHidden.style.overflow = "auto";
      loginView.style.display = "none";
      navBar.style.display = "block";
      appContent.style.display = "block";

      let adminMenu = "";
      if (user.role === "admin") {
        reservasActionsHeader.style.display = "table-cell";
        adminMenu = `
                <div class="dropdown ms-2">
                  <button class="btn btn-secondary dropdown-toggle" type="button" id="adminMenuButton" data-bs-toggle="dropdown" aria-expanded="false">
                    Admin
                  </button>
                  <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end" aria-labelledby="adminMenuButton">
                    <li><a class="dropdown-item" href="#" id="navManageNotebooksBtn"><i class="bi bi-laptop me-2"></i>Gerenciar Notebooks</a></li>
                    <li><a class="dropdown-item" href="#" id="navManageUsersBtn"><i class="bi bi-people-fill me-2"></i>Gerenciar Usuários</a></li>
                    <li><a class="dropdown-item" href="#" id="navShowHistoryBtn"><i class="bi bi-clock-history me-2"></i>Histórico</a></li>
                  </ul>
                </div>
              `;
      } else {
        reservasActionsHeader.style.display = "none";
      }

      authNavLinks.innerHTML = `
            <span class="navbar-text me-3 text-light">Olá, ${
              user.nome || user.username
            }</span>
            ${adminMenu}
            <button class="btn btn-outline-light ms-2" id="logoutBtn">Sair</button>`;

      document
        .getElementById("logoutBtn")
        .addEventListener("click", logout);
      if (user.role === "admin") {
        document
          .getElementById("navManageUsersBtn")
          .addEventListener("click", (e) => {
            e.preventDefault();
            usersContainer.innerHTML =
              '<p class="text-center text-muted">Carregando...</p>';
            apiFetch("/users")
              .then(renderUsers)
              .catch((err) => showNotification(err.message, "danger"));
            gerenciarUsuariosModal.show();
          });
        document
          .getElementById("navManageNotebooksBtn")
          .addEventListener("click", (e) => {
            e.preventDefault();
            gerenciarNotebooksModal.show();
          });
        document
          .getElementById("navShowHistoryBtn")
          .addEventListener("click", (e) => {
            e.preventDefault();
            historyContainer.innerHTML =
              '<p class="text-center text-muted">Carregando...</p>';
            apiFetch("/historico")
              .then(renderHistory)
              .catch((err) => showNotification(err.message, "danger"));
            historicoModal.show();
          });
      }

      loadData();
    } else {
      loginView.style.display = "block";
      bodyOverflowHidden.style.overflow = "hidden";
      navBar.style.display = "none";
      appContent.style.display = "none";
      authNavLinks.innerHTML = "";
    }
  };

  const showNotification = (message, type = "info") => {
    const toastContainer = document.getElementById("notification-area");
    const toastId = `toast-${Date.now()}`;
    const toastHTML = `<div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert"><div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div>`;
    toastContainer.insertAdjacentHTML("beforeend", toastHTML);
    const toast = new bootstrap.Toast(document.getElementById(toastId), {
      delay: 3000,
    });
    toast.show();
  };

  const renderNotebooks = (notebooks, reservas) => {
    const reservedUntilMap = new Map();
    reservas.forEach((r) =>
      (r.notebooks || []).forEach((n) =>
        reservedUntilMap.set(n.id, new Date(r.data_fim))
      )
    );
    notebooksContainer.innerHTML = "";
    if (notebooks.length === 0) {
      notebooksContainer.innerHTML =
        '<p class="text-muted">Nenhum notebook disponível no momento.</p>';
      return;
    }
    notebooks.forEach((notebook) => {
      const card = document.createElement("div");
      card.className = "notebook-card";
      card.dataset.id = notebook.id;
      card.innerHTML = `
              <i class="bi bi-check-circle-fill selection-icon"></i>
              <img src="notebook.png" alt="Notebook">
              <div class="notebook-card-body">
                <h5 class="notebook-card-title" title="${notebook.nome}">${
        notebook.nome
      }</h5>
                <p class="notebook-card-text">${
                  notebook.patrimonio
                    ? `(${notebook.patrimonio})`
                    : "Sem patrimônio"
                }</p>
              </div>`;

      const isReserved =
        reservedUntilMap.has(notebook.id) &&
        reservedUntilMap.get(notebook.id) > new Date();
      const isAvailable = notebook.status === "disponivel" && !isReserved;

      if (isAvailable) {
        card.addEventListener("click", () =>
          toggleNotebookSelection(notebook.id)
        );
      } else {
        card.classList.add("disabled");
        let title = `Status: ${notebook.status.replace("_", " ")}`;
        if (isReserved)
          title = `Reservado até ${reservedUntilMap
            .get(notebook.id)
            .toLocaleDateString("pt-BR")}`;
        card.setAttribute("title", title);
        new bootstrap.Tooltip(card);
      }
      notebooksContainer.appendChild(card);
    });
    updateSelectionUI();
  };

  const renderReservas = (reservas) => {
    reservasContainer.innerHTML = "";
    const activeReservas = reservas.filter(
      (r) => new Date(r.data_fim) > new Date()
    );
    reservasPlaceholder.style.display =
      activeReservas.length > 0 ? "none" : "block";
    const user = getUser();
    activeReservas.forEach((reserva) => {
      const tr = document.createElement("tr");
      const notebookDetails = (reserva.notebooks || [])
        .map((nb) => `${nb.patrimonio ? "(" + nb.patrimonio + ")" : ""}`)
        .join(", ");
      const nomeCompleto = reserva.responsavel;
      const primeiroNome = nomeCompleto.split(" ")[0];
      const deleteButtonHTML =
        user && user.role === "admin"
          ? `<button class="btn btn-danger btn-sm" onclick="cancelarReserva('${reserva.id}')" title="Cancelar Reserva"><i class="bi bi-trash-fill"></i></button>`
          : "";
      tr.innerHTML = `
              <td><span data-bs-toggle="tooltip" title="${nomeCompleto}">${primeiroNome}</span></td>
              <td>${notebookDetails || "N/A"}</td>
              <td>${new Date(reserva.data_inicio).toLocaleString(
                "pt-BR"
              )}</td>
              <td>${new Date(reserva.data_fim).toLocaleDateString(
                "pt-BR"
              )}</td>
              <td>${deleteButtonHTML}</td>`;
      reservasContainer.appendChild(tr);
    });
    [
      ...reservasContainer.querySelectorAll('[data-bs-toggle="tooltip"]'),
    ].map((el) => new bootstrap.Tooltip(el));
  };

  const renderGerenciarNotebooksList = () => {
    gerenciarNotebooksList.innerHTML = "";
    if (allNotebooks.length === 0) {
      gerenciarNotebooksList.innerHTML =
        '<p class="text-center text-muted p-3">Nenhum notebook cadastrado.</p>';
      return;
    }
    allNotebooks
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .forEach((notebook) => {
        const item = document.createElement("div");
        item.className =
          "list-group-item d-flex justify-content-between align-items-center";
        const statusBadges = {
          disponivel: '<span class="badge bg-success">Disponível</span>',
          em_manutencao:
            '<span class="badge bg-warning text-dark">Manutenção</span>',
          inativo: '<span class="badge bg-secondary">Inativo</span>',
        };
        item.innerHTML = `
              <div>
                  <h6 class="mb-1">${notebook.nome}</h6>
                  <small class="text-muted">Patrimônio: ${
                    notebook.patrimonio || "N/A"
                  }</small>
              </div>
              <div class="d-flex align-items-center">
                  ${statusBadges[notebook.status] || ""}
                  <button class="btn btn-outline-primary btn-sm ms-3" onclick="handleEditNotebook(${
                    notebook.id
                  })"><i class="bi bi-pencil-fill"></i></button>
                  <button class="btn btn-outline-danger btn-sm ms-2" onclick="handleDeleteNotebook(${
                    notebook.id
                  })"><i class="bi bi-trash-fill"></i></button>
              </div>`;
        gerenciarNotebooksList.appendChild(item);
      });
  };

  const renderHistory = (history) => {
    if (!history || history.length === 0) {
      historyContainer.innerHTML =
        '<p class="text-center text-muted p-3">Nenhum registro no histórico.</p>';
      return;
    }
    const table = document.createElement("table");
    table.className = "table table-sm table-bordered table-striped";
    table.innerHTML = `<thead><tr><th>Ação</th><th>Data</th><th>Responsável</th><th>Detalhes</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector("tbody");
    history.forEach((entry) => {
      const tr = document.createElement("tr");
      const actionClass =
        entry.action === "RESERVA_CRIADA"
          ? "text-success"
          : "text-danger";
      const notebooks = (entry.data.notebooks || [])
        .map((n) => `${n.nome} (${n.patrimonio || "N/A"})`)
        .join(", ");
      const responsavel =
        entry.action === "RESERVA_CANCELADA"
          ? `${entry.data.responsavel} (Cancelado por: ${entry.data.canceledBy})`
          : entry.data.responsavel;
      tr.innerHTML = `
              <td><strong class="${actionClass}">${entry.action.replace(
        /_/g,
        " "
      )}</strong></td>
              <td>${new Date(entry.timestamp).toLocaleString("pt-BR")}</td>
              <td>${responsavel}</td>
              <td>${notebooks}</td>
            `;
      tbody.appendChild(tr);
    });
    historyContainer.innerHTML = "";
    historyContainer.appendChild(table);
  };

  const renderUsers = (users) => {
    if (!users || users.length === 0) {
      usersContainer.innerHTML =
        '<p class="text-center text-muted p-3">Nenhum usuário cadastrado.</p>';
      return;
    }
    const table = document.createElement("table");
    table.className = "table table-sm table-bordered table-striped";
    table.innerHTML = `<thead><tr><th>Nome</th><th>Matrícula</th><th>Email</th><th>Função</th><th>Grupo</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector("tbody");
    users.forEach((user) => {
      const tr = document.createElement("tr");
      const roleMap = { admin: "Administrador", user: "Usuário" };
      const roleClass =
        user.role === "admin" ? "fw-bold text-danger" : "";
      tr.innerHTML = `
              <td>${user.nome}</td>
              <td>${user.matricula || "N/A"}</td>
              <td>${user.email}</td>
              <td>${user.funcao || "N/A"}</td>
              <td class="${roleClass}">${
        roleMap[user.role] || "Desconhecido"
      }</td>
            `;
      tbody.appendChild(tr);
    });
    usersContainer.innerHTML = "";
    usersContainer.appendChild(table);
  };

  // --- INICIALIZAÇÃO ---
  updateUI();
});