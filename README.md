# Sistema de Agendamento de Notebooks

### 📝 Sobre o Projeto

O **Sistema de Agendamento de Notebooks** é uma aplicação web completa, desenvolvida para facilitar a gestão e reserva de equipamentos de TI em um ambiente corporativo. A plataforma permite que os colaboradores visualizem os notebooks disponíveis, realizem agendamentos de forma simples e intuitiva, e que os administradores tenham uma visão clara do estado de cada equipamento.

Este projeto foi construído com uma arquitetura desacoplada, com um backend robusto responsável pela lógica de negócio e uma interface de frontend moderna e reativa para a interação com o usuário.

---

## ✨ Funcionalidades Principais

- **Visualização de Notebooks**: Interface em formato de cartões que exibe todos os notebooks, com imagem, nome e número de patrimônio.
- **Status em Tempo Real**: Os notebooks são exibidos como "disponíveis" ou "indisponíveis" (seja por manutenção ou por já estarem reservados), com feedback visual claro.
- **Reserva Simplificada**: Ao clicar em um notebook disponível, um modal é aberto para que o colaborador preencha seus dados e a data de devolução.
- **Lista de Reservas Ativas**: Uma tabela exibe todos os agendamentos que estão em andamento, mostrando o responsável, o equipamento reservado e as datas.
- **Cancelamento de Reservas**: É possível cancelar uma reserva ativa diretamente pela interface.
- **API RESTful**: Backend com endpoints bem definidos para gerenciar notebooks e reservas.

---

## 🚀 Tecnologias Utilizadas

Este projeto foi desenvolvido com as seguintes tecnologias:

### Backend

| Tecnologia | Descrição |
| :--- | :--- |
| **Node.js** | Ambiente de execução para o JavaScript no servidor. |
| **Express.js** | Framework para a construção da API, gerenciamento de rotas e middlewares. |
| **SQLite** | Banco de dados relacional leve, baseado em arquivo, para persistência dos dados. |
| **CORS** | Middleware para permitir requisições de diferentes origens (essencial para a comunicação frontend-backend). |
| **UUID** | Biblioteca para a geração de identificadores únicos para as reservas. |

### Frontend

| Tecnologia | Descrição |
| :--- | :--- |
| **HTML5** | Linguagem de marcação para a estrutura da página. |
| **Bootstrap** | Framework CSS para a criação de uma interface responsiva e moderna. |
| **JavaScript**| Linguagem de programação para a interatividade, manipulação do DOM e comunicação com a API. |


---

## ⚙️ Como Executar o Projeto

Para executar este projeto localmente, siga os passos abaixo.

### Pré-requisitos

Antes de começar, certifique-se de que você tem o [Node.js](https://nodejs.org/en/) (que inclui o npm) instalado na sua máquina.

### 1. Clonar o Repositório

```bash
git clone [https://github.com/WellingtonSilva12/agendamento.git](https://github.com/WellingtonSilva12/agendamento.git)
cd agendamento
```

### 2. Configurar e Iniciar o Backend

Navegue até a pasta do backend, instale as dependências e inicie o servidor.

```bash
# A partir da raiz do projeto
cd backend

# Instalar as dependências
npm install

# Iniciar o servidor
npm start
```

O servidor backend estará rodando em `http://localhost:5000`. O banco de dados `agendamentos.db` será criado automaticamente na primeira execução.

### 3. Abrir o Frontend

Navegue até a pasta do frontend e abra o arquivo `index.html` no seu navegador de preferência.

```bash
# A partir da raiz do projeto
cd frontend

# No Windows
start index.html

# No macOS
open index.html

# No Linux
xdg-open index.html
```

A aplicação estará pronta para uso, comunicando-se com o backend que você iniciou no passo anterior.

---

## ↔️ Endpoints da API

A API do backend oferece os seguintes endpoints para gerenciamento:

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/notebooks` | Lista todos os notebooks cadastrados. |
| `GET` | `/api/reservas` | Lista todas as reservas ativas. |
| `POST` | `/api/reservas` | Cria uma nova reserva. |
| `DELETE`| `/api/reservas/:id` | Cancela uma reserva existente. |

**Exemplo de corpo (body) para `POST /api/reservas`:**

```json
{
  "responsavel": "Nome do Colaborador (Função - Matrícula)",
  "data_inicio": "2024-07-15T18:00:00.000Z",
  "data_fim": "2024-07-20T23:59:59.000Z",
  "notebooks_ids": [1]
}
```

---

## 👨‍💻 Autor

Projeto desenvolvido com dedicação por **Wellington Silva**.